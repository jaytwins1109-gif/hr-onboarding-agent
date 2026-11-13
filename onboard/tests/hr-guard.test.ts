// tests/hr-guard.test.ts
//
// 独立守卫回归（2026-11-07 补证轮新增，与 hr-assistant.test.ts 互补）：
//   - 软删除四路：isDeleted / deletedAt / status / scope，全走 canAccessKnowledgeItem
//     单元断言 + 端到端"不得召回"断言
//   - 越权：employee 不召回 new_hire 种子；unknown 直接拒绝；
//     employee 分支接口存在且可用（mock 一条含 employee 的条目验证）
//   - 对照条目：同内容未删除条目可召回，证明守卫"有牙"（不是靠匹配不到才安全）
//   - 输出红线：chat_text 无 JSON 字段名；structured_json 为合法对象且字段齐全
//
// 测试条目用 guard_ 前缀，afterAll 物理清理（测试数据不适用软删除留痕约定）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { canAccessKnowledgeItem, runLocalWorkflow } from '@/lib/llm/local-workflow';
import { runChatTurn, runStructuredTurn } from '@/lib/chat/handlers';

const GUARD_IDS = ['guard_faq_deleted', 'guard_faq_control', 'guard_faq_employee'];

/** 守卫单元断言用的条目形状（与 KnowledgeItem 运行时字段一致） */
function item(
  overrides: Partial<{
    allowedRoles: string;
    isDeleted: boolean;
    deletedAt: Date | null;
    status: string;
    scope: string;
  }> = {},
) {
  return {
    allowedRoles: '["new_hire"]',
    isDeleted: false,
    deletedAt: null,
    status: 'active',
    scope: 'new_hire_public',
    ...overrides,
  };
}

beforeAll(async () => {
  // 种子基线（与 prisma/seed.ts 同源，幂等）
  await prisma.knowledgeItem.upsert({
    where: { id: 'faq_hr_onboarding_001' },
    update: {},
    create: {
      id: 'faq_hr_onboarding_001',
      question: '入职需要准备哪些材料？',
      answer:
        '常见材料包括身份证、学历/学位证明、银行卡、离职证明（如适用）、证件照等；具体以 HR 通知为准。',
      tags: JSON.stringify(['入职材料', '新员工', '报到']),
      scope: 'new_hire_public',
      allowedRoles: JSON.stringify(['new_hire']),
      status: 'active',
      source: 'seed_faq_v0.1_hr_confirm_required',
    },
  });
  // 对照条目（active，内容含守卫测试关键词）
  await prisma.knowledgeItem.upsert({
    where: { id: 'guard_faq_control' },
    update: { isDeleted: false, deletedAt: null },
    create: {
      id: 'guard_faq_control',
      question: '健身房申请流程和所需材料是什么？',
      answer: '这是对照条目：健身房申请走行政流程，具体以 HR 通知为准。',
      tags: JSON.stringify(['健身房', '流程', '材料']),
      scope: 'new_hire_public',
      allowedRoles: JSON.stringify(['new_hire']),
      status: 'active',
      source: 'test',
    },
  });
  // 被软删除条目（与对照条目同内容）
  await prisma.knowledgeItem.upsert({
    where: { id: 'guard_faq_deleted' },
    update: { isDeleted: true, deletedAt: new Date() },
    create: {
      id: 'guard_faq_deleted',
      question: '健身房申请流程和所需材料是什么？',
      answer: '这个条目已被软删除，不应该出现在任何回答里。',
      tags: JSON.stringify(['健身房', '流程', '材料']),
      scope: 'new_hire_public',
      allowedRoles: JSON.stringify(['new_hire']),
      status: 'active',
      source: 'test',
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
  // employee 分支验证条目：scope 仍为 new_hire_public（守卫的 scope 白名单固定），
  // 但 allowedRoles 只放 employee —— 证明 employee 分支端到端真的能通。
  // （批次9 收紧匹配资格线后，query 需在 question/tags 命中 2 个不同关键词，
  //   所以问法/夹具补了「对接人」这个关键词。update 里同步写，防旧库残留行。）
  await prisma.knowledgeItem.upsert({
    where: { id: 'guard_faq_employee' },
    update: {
      isDeleted: false,
      deletedAt: null,
      question: '内购福利申请流程和对接人是谁？',
      tags: JSON.stringify(['内购', '流程', '对接人']),
    },
    create: {
      id: 'guard_faq_employee',
      question: '内购福利申请流程和对接人是谁？',
      answer: '这是 employee 专属条目：内购走内部系统申请。',
      tags: JSON.stringify(['内购', '流程', '对接人']),
      scope: 'new_hire_public',
      allowedRoles: JSON.stringify(['employee']),
      status: 'active',
      source: 'test',
    },
  });
});

afterAll(async () => {
  await prisma.knowledgeItem.deleteMany({ where: { id: { in: GUARD_IDS } } });
  await prisma.$disconnect();
});

describe('软删除四路（canAccessKnowledgeItem 单元）', () => {
  it('isDeleted=true → 拒绝', () => {
    expect(canAccessKnowledgeItem(item({ isDeleted: true }), 'new_hire')).toBe(false);
  });
  it('deletedAt 非空（isDeleted=false）→ 拒绝', () => {
    expect(canAccessKnowledgeItem(item({ deletedAt: new Date() }), 'new_hire')).toBe(false);
  });
  it('status!=active → 拒绝', () => {
    expect(canAccessKnowledgeItem(item({ status: 'draft' }), 'new_hire')).toBe(false);
    expect(canAccessKnowledgeItem(item({ status: 'archived' }), 'new_hire')).toBe(false);
  });
  it('scope 不匹配 → 拒绝', () => {
    expect(canAccessKnowledgeItem(item({ scope: 'employee_internal' }), 'new_hire')).toBe(false);
  });
});

describe('软删除端到端：被删条目不得召回', () => {
  it('structured_json：matched_faq_ids 不含 guard_faq_deleted，对照组正常出场', async () => {
    const result = await runLocalWorkflow({
      message: '健身房申请需要什么材料和流程？',
      userRole: 'new_hire',
      outputMode: 'structured_json',
    });
    expect(typeof result).not.toBe('string');
    const json = result as Exclude<typeof result, string>;
    expect(json.matched_faq_ids).toContain('guard_faq_control');
    expect(json.matched_faq_ids).not.toContain('guard_faq_deleted');
    expect(json.answer).not.toContain('软删除');
  });
});

describe('越权守卫', () => {
  it('employee 不召回 new_hire 种子条目，chat_text 走固定兜底', async () => {
    const reply = await runChatTurn({
      message: '入职需要准备哪些材料？',
      userRole: 'employee',
    });
    expect(reply).toBe('不清楚，建议联系 HR。');
  });

  it('userRole=unknown 直接拒绝（单元）', () => {
    expect(canAccessKnowledgeItem(item(), 'unknown')).toBe(false);
  });
  it('unknown 角色端到端也走兜底', async () => {
    const result = await runLocalWorkflow({
      message: '入职需要准备哪些材料？',
      userRole: 'unknown',
      outputMode: 'structured_json',
    });
    const json = result as Exclude<typeof result, string>;
    expect(json.answer).toBe('不清楚，建议联系 HR。');
    expect(json.matched_faq_ids).toEqual([]);
  });

  it('employee 分支接口存在且可用：mock 一条含 employee 的条目可访问', () => {
    expect(
      canAccessKnowledgeItem(item({ allowedRoles: '["new_hire","employee"]' }), 'employee'),
    ).toBe(true);
  });
  it('employee 专属条目（allowedRoles 仅 employee）employee 可召回', async () => {
    const result = await runLocalWorkflow({
      message: '内购申请流程要找哪个对接人？',
      userRole: 'employee',
      outputMode: 'structured_json',
    });
    const json = result as Exclude<typeof result, string>;
    expect(json.matched_faq_ids).toContain('guard_faq_employee');
  });
  it('new_hire 访问 employee 专属条目不可召回（反向）', async () => {
    const result = await runLocalWorkflow({
      message: '内购申请流程要找哪个对接人？',
      userRole: 'new_hire',
      outputMode: 'structured_json',
    });
    const json = result as Exclude<typeof result, string>;
    // 核心越权断言：employee-only 条目绝不出场。
    // 同问法在 new_hire 下最多命中种子条目（通用词「入职/流程」不算资格——批次9 起需
    // question/tags 命中 2 个不同关键词），兜底或种子出场都合法，唯独 employee 条目不行。
    expect(json.matched_faq_ids).not.toContain('guard_faq_employee');
    expect(json.answer).not.toContain('内购走内部系统');
  });
});

describe('输出红线', () => {
  it('chat_text 纯文本：不含 matched_faq_ids / needs_human / confidence / JSON 代码块', async () => {
    const reply = await runChatTurn({
      message: '入职需要准备哪些材料？',
      userRole: 'new_hire',
    });
    expect(typeof reply).toBe('string');
    expect(reply).toContain('身份证');
    expect(reply).not.toContain('matched_faq_ids');
    expect(reply).not.toContain('needs_human');
    expect(reply).not.toContain('confidence');
    expect(reply).not.toContain('```');
    expect(reply).not.toContain('{');
  });

  it('structured_json 为合法对象且五字段齐全、类型正确', async () => {
    const result = await runStructuredTurn({
      message: '入职需要准备哪些材料？',
      userRole: 'new_hire',
    });
    expect(result).not.toBeTypeOf('string');
    expect(Object.keys(result).sort()).toEqual(
      ['answer', 'confidence', 'matched_faq_ids', 'needs_human', 'reason'].sort(),
    );
    expect(typeof result.answer).toBe('string');
    expect(Array.isArray(result.matched_faq_ids)).toBe(true);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    expect(typeof result.needs_human).toBe('boolean');
    expect(typeof result.reason).toBe('string');
    expect(result.matched_faq_ids).toContain('faq_hr_onboarding_001');
  });

  it('无匹配时 structured_json 为严格兜底对象（no_match / low / needs_human=true）', async () => {
    const result = await runStructuredTurn({
      message: '公司股票怎么买？',
      userRole: 'new_hire',
    });
    expect(result.answer).toBe('不清楚，建议联系 HR。');
    expect(result.matched_faq_ids).toEqual([]);
    expect(result.confidence).toBe('low');
    expect(result.needs_human).toBe(true);
    expect(result.reason).toBe('no_match');
  });
});
