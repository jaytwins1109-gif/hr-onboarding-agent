// lib/workspace/leave-answer.ts
//
// 第 18 段：个人年假「直读账本」回答。
// 员工问「我还剩多少年假」这类**本人数据**时，服务端直接读账本作答，
// 不经模型、不走制度检索——模型只负责制度条文，不负责个人数据。
//
// 红线：
//   1. 只认服务端传入的本人 userId（answer-service 从会话归属取），不接收前端 userId。
//   2. 没有流水时返回「未录入」，绝不把 null 说成 0 天。
//   3. 制度类问法（结转 / 规定 / 怎么算）一律不在这里命中，仍走制度检索。

import { currentLeaveYear, formatDays, parseLeaveYear } from './leave';
import type { AnswerPayload, LedgerEntryRef } from './answer-schema';

const LEAVE_ENTITY = /年假|年休假/;
const FIRST_PERSON = /我|本人|咱/;
const BALANCE_HINT = /还剩|还有|余额|剩余|剩几天|剩多少|多少天|几天|多少|查/;
const POLICY_HINT =
  /结转|规定|政策|制度|条款|文件|怎么算|如何计算|根据国家|劳动法|法定|入职|试用期|满一年|工龄|能不能|可以吗|前休|逾期/;

/**
 * 是不是「查我本人的年假余额」。
 * 必须同时有：年假实体 + 第一人称 + 余额语义，且不碰制度关键词。
 */
export function isPersonalLeaveQuery(question: string): boolean {
  const q = question.trim();
  if (!q || q.length > 200) return false;
  return (
    LEAVE_ENTITY.test(q) && FIRST_PERSON.test(q) && BALANCE_HINT.test(q) && !POLICY_HINT.test(q)
  );
}

/** 从问法里取年度：显式年份 > 去年 > 今年 > 默认今年（北京时间） */
export function queryLeaveYear(question: string, now: Date = new Date()): number {
  const explicit = question.match(/(20\d{2})\s*年?/);
  if (explicit) {
    const parsed = parseLeaveYear(explicit[1]);
    if (parsed.ok) return parsed.value;
  }
  if (/去年/.test(question)) return currentLeaveYear(now) - 1;
  return currentLeaveYear(now);
}

export const PERSONAL_LEAVE_MODEL = '账本直读';

/**
 * 把账本余额组装成现有 AnswerPayload，复用同一套气泡与持久化链路。
 * balance=null 表示「没有流水」，不是 0 天。
 * entries 是逐条流水引用（日期 + 事由 + 增减），只列原始记录，不写解释话术。
 */
export function personalLeaveAnswer(input: {
  question: string;
  year: number;
  balance: number | null;
  entries: LedgerEntryRef[];
  elapsedMs: number;
}): AnswerPayload {
  const base = {
    status: 'supported' as const,
    citations: [],
    missing: [],
    conflicts: [],
    notice: null,
    ledgerEntries: input.entries,
    model: PERSONAL_LEAVE_MODEL,
    elapsedMs: input.elapsedMs,
    verified: true,
    rejected: [],
  };

  if (input.balance === null) {
    return {
      ...base,
      statusLabel: '账本暂无记录',
      conclusions: [
        {
          text: `${input.year} 年的年假账本里还没有你的记录，这不代表余额为 0。可以联系 HR 确认，或到「我的年假」页查看明细。`,
          citationIds: [],
        },
      ],
    };
  }

  return {
    ...base,
    statusLabel: '本人年假账本',
    conclusions: [
      {
        text: `截至 ${input.year} 年，你的年假余额是 ${formatDays(input.balance)} 天。`,
        citationIds: [],
      },
    ],
  };
}
