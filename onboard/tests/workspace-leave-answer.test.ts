/**
 * 第 18 段：个人年假直读 + 回答诊断信息权限的离线测试。
 * 钉住：本人年假问法命中、制度类问法不误伤、无流水不说成 0 天、
 * 调试信息仅管理员及以上可见。
 */
import { describe, expect, it } from 'vitest';
import { canSeeAnswerDiagnostics } from '@/lib/workspace/access';
import {
  isPersonalLeaveQuery,
  PERSONAL_LEAVE_MODEL,
  personalLeaveAnswer,
  queryLeaveYear,
} from '@/lib/workspace/leave-answer';

const ENTRIES = [
  { date: '2026-01-02', reason: '年初发放', delta: 4.5 },
  { date: '2026-01-03', reason: '已休', delta: -2 },
];

describe('个人年假问法识别', () => {
  const hits = [
    '我今年还剩多少年假？',
    '我还有几天年假？',
    '我的年假余额还有多少',
    '本人年假剩余几天',
    '查查我的年假',
    '咱还剩多少年休假',
    '2025 年我还有几天年假',
  ];
  for (const q of hits) {
    it(`命中本人年假问法：${q}`, () => {
      expect(isPersonalLeaveQuery(q)).toBe(true);
    });
  }

  const misses = [
    '年假可以结转到明年吗？',
    '公司年假制度是怎么规定的',
    '国家法定年假多少天',
    '试用期内有没有年假',
    '我入职满一年年假怎么算',
    '报销应该怎么办？',
    '公司有哪些制度可以查？',
    '',
  ];
  for (const q of misses) {
    it(`制度类/无关问法不误伤：${q || '（空）'}`, () => {
      expect(isPersonalLeaveQuery(q)).toBe(false);
    });
  }
});

describe('年假年度解析', () => {
  const now = new Date('2026-11-17T12:00:00Z');

  it('默认取今年（北京时间年度）', () => {
    expect(queryLeaveYear('我还剩多少年假', now)).toBe(2026);
  });

  it('显式年份优先', () => {
    expect(queryLeaveYear('2025 年我还有几天年假', now)).toBe(2025);
  });

  it('去年取上一年', () => {
    expect(queryLeaveYear('我去年年假还剩几天', now)).toBe(2025);
  });

  it('越界年份回退今年', () => {
    expect(queryLeaveYear('1900 年我还有几天年假', now)).toBe(2026);
  });
});

describe('年假回答组装', () => {
  const meta = { question: '我今年还剩多少年假？', year: 2026, elapsedMs: 12 };

  it('有流水时给出余额与「本人年假账本」口径', () => {
    const payload = personalLeaveAnswer({ ...meta, balance: 7.5, entries: ENTRIES });
    expect(payload.status).toBe('supported');
    expect(payload.statusLabel).toBe('本人年假账本');
    expect(payload.conclusions[0].text).toContain('7.5 天');
    expect(payload.conclusions[0].citationIds).toEqual([]);
    expect(payload.citations).toEqual([]);
    expect(payload.model).toBe(PERSONAL_LEAVE_MODEL);
    expect(payload.verified).toBe(true);
  });

  it('黄色引用行只列流水，不写解释话术', () => {
    const payload = personalLeaveAnswer({ ...meta, balance: 2.5, entries: ENTRIES });
    expect(payload.notice).toBeNull();
    expect(payload.ledgerEntries).toEqual(ENTRIES);
    expect(payload.ledgerEntries?.map((e) => e.delta)).toEqual([4.5, -2]);
    const allText = JSON.stringify(payload);
    expect(allText).not.toContain('未经 AI 生成');
    expect(allText).not.toContain('不属于制度条文');
  });

  it('整数余额不带小数尾巴', () => {
    const payload = personalLeaveAnswer({ ...meta, balance: 5, entries: ENTRIES });
    expect(payload.conclusions[0].text).toContain('5 天');
    expect(payload.conclusions[0].text).not.toContain('5.0 天');
  });

  it('无流水时不说成 0 天，明确提示未录入', () => {
    const payload = personalLeaveAnswer({ ...meta, balance: null, entries: [] });
    expect(payload.statusLabel).toBe('账本暂无记录');
    expect(payload.conclusions[0].text).toContain('还没有你的记录');
    expect(payload.conclusions[0].text).toContain('不代表余额为 0');
    expect(payload.ledgerEntries).toEqual([]);
  });

  it('0 天是真实余额，不说成未录入', () => {
    const payload = personalLeaveAnswer({ ...meta, balance: 0, entries: [] });
    expect(payload.statusLabel).toBe('本人年假账本');
    expect(payload.conclusions[0].text).toContain('0 天');
    expect(payload.conclusions[0].text).not.toContain('还没有你的记录');
  });
});

describe('回答诊断信息可见性', () => {
  it('员工看不到底部署名与耗时', () => {
    expect(canSeeAnswerDiagnostics('USER')).toBe(false);
    expect(canSeeAnswerDiagnostics(undefined)).toBe(false);
    expect(canSeeAnswerDiagnostics('UNKNOWN_ROLE')).toBe(false);
  });

  it('HR 管理员 / 产品运营 / 系统管理员可见', () => {
    expect(canSeeAnswerDiagnostics('ADMIN')).toBe(true);
    expect(canSeeAnswerDiagnostics('PRODUCT_OPS')).toBe(true);
    expect(canSeeAnswerDiagnostics('DEVELOPER')).toBe(true);
  });
});
