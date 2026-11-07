// lib/llm/local-workflow.ts
//
// 2026-11-07 底层换血：旧业务打分 / 价格过滤 / 推荐 / 加购 / 库存判断全部移除。
// 现在只有一个最小流程：知识库检索 → 权限守卫 → FAQ 关键词匹配 → 固定兜底。
//
// 铁律：
//   - 兜底话术严格为 FALLBACK_TEXT（“不清楚，建议联系 HR。”），不许换说法；
//   - 软删除（isDeleted / deletedAt）、非 active、scope 不匹配、越权条目一律不可召回；
//   - structured_json 输出严格 JSON 对象，不带 Markdown 代码块。

import { prisma } from '@/lib/db';
import type { KnowledgeItem } from '@prisma/client';

export const FALLBACK_TEXT = '不清楚，建议联系 HR。';

export const FALLBACK_JSON = {
  answer: FALLBACK_TEXT,
  matched_faq_ids: [] as string[],
  confidence: 'low' as const,
  needs_human: true,
  reason: 'no_match',
};

const KEYWORDS = [
  '材料', '身份证', '学历', '学位', '银行卡', '离职证明', 'offer', '入职',
  '报到', '流程', '地点', '对接人', '联系', 'HR', '咨询', '新员工',
];

function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function canAccessKnowledgeItem(
  item: {
    allowedRoles: string;
    isDeleted: boolean;
    deletedAt: Date | null;
    status: string;
    scope: string;
  },
  userRole: string,
): boolean {
  if (item.status !== 'active') return false;
  if (item.isDeleted || item.deletedAt) return false;
  if (item.scope !== 'new_hire_public') return false;

  const roles = parseJsonArray(item.allowedRoles);

  // 预留 employee 接口：本期种子不含 employee，但守卫支持该角色。
  if (userRole === 'new_hire') return roles.includes('new_hire');
  if (userRole === 'employee') return roles.includes('employee');
  return false;
}

function matchFaq(message: string, items: KnowledgeItem[]) {
  const text = message.toLowerCase();
  const userHits = KEYWORDS.filter((k) => text.includes(k.toLowerCase()));
  if (userHits.length === 0) return { best: null, score: 0 };

  let best: KnowledgeItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const question = item.question.toLowerCase();
    const answer = item.answer.toLowerCase();
    const tags = item.tags.toLowerCase();
    let score = 0;

    for (const k of userHits) {
      const key = k.toLowerCase();
      if (question.includes(key)) score += 3;
      if (tags.includes(key)) score += 2;
      if (answer.includes(key)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  // 阈值：最高分 >= 2 且至少命中 question/tags 才认为可答；否则走兜底。
  if (!best || bestScore < 2) return { best: null, score: bestScore };
  return { best, score: bestScore };
}

export interface LocalWorkflowInput {
  message: string;
  userRole: string;
  outputMode: 'chat_text' | 'structured_json';
}

export type LocalWorkflowResult = string | typeof FALLBACK_JSON | MatchedJson;

export interface MatchedJson {
  answer: string;
  matched_faq_ids: string[];
  confidence: 'high' | 'medium' | 'low';
  needs_human: boolean;
  reason: string;
}

export async function runLocalWorkflow(input: LocalWorkflowInput): Promise<LocalWorkflowResult> {
  const items = await prisma.knowledgeItem.findMany({
    where: {
      status: 'active',
      isDeleted: false,
      scope: 'new_hire_public',
    },
  });

  const visible = items.filter((item) => canAccessKnowledgeItem(item, input.userRole));
  const { best, score } = matchFaq(input.message, visible);

  if (!best) {
    if (input.outputMode === 'chat_text') return FALLBACK_TEXT;
    return FALLBACK_JSON;
  }

  const confidence = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
  const needsHuman = confidence === 'low';

  if (input.outputMode === 'chat_text') {
    return needsHuman ? FALLBACK_TEXT : best.answer;
  }

  return {
    answer: needsHuman ? FALLBACK_TEXT : best.answer,
    matched_faq_ids: needsHuman ? [] : [best.id],
    confidence,
    needs_human: needsHuman,
    reason: needsHuman ? 'low_confidence' : 'matched',
  };
}
