// tests/hr-assistant.test.ts
//
// HR 助理底层换血回归（2026-11-07）：
//   - 种子 3 条 KnowledgeItem 状态正确
//   - FAQ 命中 / 固定兜底 / 软删除守卫 / 越权守卫 / 纯文本输出红线
//
// 说明：种子断言用与 prisma/seed.ts 完全同源的 3 条数据先 upsert 再校验
//（seed.ts 顶层执行 main() 且会 $disconnect，直接 import 会污染后续用例的连接）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { canAccessKnowledgeItem, FALLBACK_TEXT } from '@/lib/llm/local-workflow';
import { runChatTurn, runStructuredTurn } from '@/lib/chat/handlers';

const SEED_FAQS = [
  {
    id: 'faq_hr_onboarding_001',
    question: '入职需要准备哪些材料？',
    tags: ['入职材料', '新员工', '报到'],
  },
  {
    id: 'faq_hr_onboarding_002',
    question: '入职当天流程是什么？',
    tags: ['入职当天', '报到流程', '新员工'],
  },
  {
    id: 'faq_hr_onboarding_003',
    question: '入职咨询应该联系谁？',
    tags: ['联系HR', '入职咨询', '新员工'],
  },
];

const TEST_IDS = ['faq_test_soft_deleted', 'faq_test_control'];

beforeAll(async () => {
  // 与 seed 同源写入（幂等），保证断言不依赖外部执行顺序
  for (const f of SEED_FAQS) {
    await prisma.knowledgeItem.upsert({
      where: { id: f.id },
      update: {},
      create: {
        id: f.id,
        question: f.question,
        answer:
          '常见材料包括身份证、学历/学位证明、银行卡、离职证明（如适用）、证件照等；具体以 HR 通知为准。',
        tags: JSON.stringify(f.tags),
        scope: 'new_hire_public',
        allowedRoles: JSON.stringify(['new_hire']),
        status: 'active',
        source: 'seed_faq_v0.1_hr_confirm_required',
      },
    });
  }
});

afterAll(async () => {
  // 测试条目物理清理（测试数据不适用软删除留痕约定）
  await prisma.knowledgeItem.deleteMany({ where: { id: { in: TEST_IDS } } });
  await prisma.$disconnect();
});

describe('seed：KnowledgeItem 基线', () => {
  it('3 条种子 FAQ 均为 status=active 且未软删除', async () => {
    const rows = await prisma.knowledgeItem.findMany({
      where: { id: { in: SEED_FAQS.map((f) => f.id) } },
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('active');
      expect(row.isDeleted).toBe(false);
      expect(row.deletedAt).toBeNull();
      expect(row.scope).toBe('new_hire_public');
    }
  });
});

describe('chat_text：纯文本模式', () => {
  it('问入职材料 → 纯文本命中 FAQ，含“身份证”，不带任何 JSON 痕迹', async () => {
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

  it('问公司股票 → 固定兜底话术，一字不差', async () => {
    const reply = await runChatTurn({
      message: '公司股票怎么买？',
      userRole: 'new_hire',
    });
    expect(reply).toBe('不清楚，建议联系 HR。');
    expect(reply).toBe(FALLBACK_TEXT);
  });
});

describe('structured_json：严格 JSON 对象', () => {
  it('问入职材料 → 命中 faq_hr_onboarding_001，needs_human=false', async () => {
    const result = await runStructuredTurn({
      message: '入职需要准备哪些材料？',
      userRole: 'new_hire',
    });
    expect(result).not.toBeTypeOf('string');
    expect(result.answer).toContain('身份证');
    expect(result.matched_faq_ids).toContain('faq_hr_onboarding_001');
    expect(result.needs_human).toBe(false);
    expect(['high', 'medium']).toContain(result.confidence);
    expect(result.reason).toBe('matched');
  });

  it('问公司股票 → 无匹配：matched_faq_ids=[] / confidence=low / needs_human=true / reason=no_match', async () => {
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

describe('检索策略收紧（批次9：question/tags 需命中 2 个不同关键词，answer 蹭分无效）', () => {
  it('问离职但库里只有入职条目（靠 answer 里的「离职证明」蹭分）→ 兜底', async () => {
    // 旧逻辑：材料(q+3, tags+2) + 离职证明(answer+1) = 6 分 → 会拿「入职材料」的答案
    // 回答「离职证明怎么办」，典型的通用词/答案文本蹭分误伤。
    // 新资格线：001 的 question/tags 只命中 {材料} 1 个不同词 → 不够格 → 兜底。
    const reply = await runChatTurn({
      message: '办理离职证明需要什么材料？',
      userRole: 'new_hire',
    });
    expect(reply).toBe('不清楚，建议联系 HR。');
  });

  it('同场景 structured_json → reason=no_match 且不出场任何种子条目', async () => {
    const result = await runStructuredTurn({
      message: '办理离职证明需要什么材料？',
      userRole: 'new_hire',
    });
    expect(result.reason).toBe('no_match');
    expect(result.matched_faq_ids).toEqual([]);
    expect(result.matched_faq_ids).not.toContain('faq_hr_onboarding_001');
  });

  it('单个通用词（「入职」）不构成资格 → 兜底（通用词人人都挂，不得蹭分）', async () => {
    // 旧逻辑：单靠「入职」在 question(+3) 就过阈值 ≥2 直接出场。
    const reply = await runChatTurn({
      message: '入职',
      userRole: 'new_hire',
    });
    expect(reply).toBe('不清楚，建议联系 HR。');
  });

  it('合法问法不受影响：问入职当天流程 → 仍命中 002', async () => {
    const result = await runStructuredTurn({
      message: '入职当天流程是什么？',
      userRole: 'new_hire',
    });
    expect(result.matched_faq_ids).toContain('faq_hr_onboarding_002');
    expect(result.needs_human).toBe(false);
  });

  it('问+标签跨字段凑满 2 个不同关键词 → 可命中：新员工咨询入职联系谁 → 003', async () => {
    // q 命中「入职」、tags 命中「新员工」——两个不同词，跨字段凑满资格线
    const result = await runStructuredTurn({
      message: '我是新员工，入职的事该咨询谁？',
      userRole: 'new_hire',
    });
    expect(result.matched_faq_ids).toContain('faq_hr_onboarding_003');
    expect(result.needs_human).toBe(false);
  });
});

describe('软删除守卫', () => {
  const deletedItem = {
    allowedRoles: '["new_hire"]',
    isDeleted: true,
    deletedAt: new Date(),
    status: 'active',
    scope: 'new_hire_public',
  };

  it('isDeleted=true 的条目不可访问', () => {
    expect(canAccessKnowledgeItem(deletedItem, 'new_hire')).toBe(false);
  });

  it('deletedAt 非空的条目不可访问（isDeleted=false 也不行）', () => {
    expect(canAccessKnowledgeItem({ ...deletedItem, isDeleted: false }, 'new_hire')).toBe(false);
  });

  it('软删除条目不会被召回：同内容对照条目可命中，被删的那条永远不出场', async () => {
    // 对照条目（active）：证明同样的内容、同样的问法，不软删除就一定召回得到
    await prisma.knowledgeItem.create({
      data: {
        id: 'faq_test_control',
        question: '健身房申请流程和所需材料是什么？',
        answer: '这是对照条目：健身房申请走行政流程，具体以 HR 通知为准。',
        tags: JSON.stringify(['健身房', '流程', '材料']),
        scope: 'new_hire_public',
        allowedRoles: JSON.stringify(['new_hire']),
        status: 'active',
        source: 'test',
      },
    });
    // 软删除条目：与对照条目内容相同，但 isDeleted=true
    await prisma.knowledgeItem.create({
      data: {
        id: 'faq_test_soft_deleted',
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
    const result = await runStructuredTurn({
      message: '健身房申请需要什么材料和流程？',
      userRole: 'new_hire',
    });
    // 核心断言：被删条目绝不出场；同内容对照组确实有召回（守卫不是靠"匹配不到"安全）。
    // 不锁死对照组具体 id：hr-guard.test.ts 并行跑时也有一条同内容对照条目，
    // 打分并列时谁先遍历到谁赢，两者都是合法的对照出场。
    expect(result.matched_faq_ids).not.toContain('faq_test_soft_deleted');
    expect(result.matched_faq_ids.length).toBeGreaterThanOrEqual(1);
    expect(result.matched_faq_ids.join()).toMatch(/faq_test_control|guard_faq_control/);
    expect(result.answer).not.toContain('软删除');
  });

  it('status 非 active / scope 不匹配的条目不可访问', () => {
    expect(
      canAccessKnowledgeItem(
        { ...deletedItem, isDeleted: false, deletedAt: null, status: 'draft' },
        'new_hire',
      ),
    ).toBe(false);
    expect(
      canAccessKnowledgeItem(
        { ...deletedItem, isDeleted: false, deletedAt: null, scope: 'employee_internal' },
        'new_hire',
      ),
    ).toBe(false);
  });
});

describe('越权守卫（employee 预留接口）', () => {
  it('employee 访问 new_hire 种子条目不可召回，走兜底', async () => {
    expect(
      canAccessKnowledgeItem(
        {
          allowedRoles: '["new_hire"]',
          isDeleted: false,
          deletedAt: null,
          status: 'active',
          scope: 'new_hire_public',
        },
        'employee',
      ),
    ).toBe(false);

    const reply = await runChatTurn({
      message: '入职需要准备哪些材料？',
      userRole: 'employee',
    });
    expect(reply).toBe('不清楚，建议联系 HR。');
  });

  it('employee 分支接口保留：allowedRoles 含 employee 时可访问', () => {
    expect(
      canAccessKnowledgeItem(
        {
          allowedRoles: '["new_hire","employee"]',
          isDeleted: false,
          deletedAt: null,
          status: 'active',
          scope: 'new_hire_public',
        },
        'employee',
      ),
    ).toBe(true);
  });

  it('批次10 起 admin 全可见（预览所有视角）；未支持的角色仍一律拒绝', () => {
    expect(
      canAccessKnowledgeItem(
        {
          allowedRoles: '["new_hire"]',
          isDeleted: false,
          deletedAt: null,
          status: 'active',
          scope: 'new_hire_public',
        },
        'admin',
      ),
    ).toBe(true);
    expect(
      canAccessKnowledgeItem(
        {
          allowedRoles: '["new_hire"]',
          isDeleted: false,
          deletedAt: null,
          status: 'active',
          scope: 'new_hire_public',
        },
        'unregistered_role',
      ),
    ).toBe(false);
  });
});
