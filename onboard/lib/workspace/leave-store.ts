// lib/workspace/leave-store.ts
//
// 年假台账的服务端读写：余额永远由流水现算，不存一份可能被覆盖的「当前余额」。
// 只追加、不更新、不删除；没有流水的人返回 balance=null（不代表余额为零）。

import { prisma } from '@/lib/db';
import type { LedgerEntryRef } from './answer-schema';
import { currentLeaveYear, sumDeltas, type LeaveSummary } from './leave';

export type { LeaveEntry, LeaveSummary } from './leave';

export function formatChinaTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function newLeaveId(): string {
  return `lv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 某人某年度的余额；调用方要区分「真的是 0」和「一条流水都没有」 */
export async function balanceFor(userId: string, year: number): Promise<number> {
  const rows = await prisma.leaveLedger.findMany({
    where: { userId, year },
    select: { delta: true },
  });
  return sumDeltas(rows);
}

export async function hasEntries(userId: string, year: number): Promise<boolean> {
  return (await prisma.leaveLedger.count({ where: { userId, year } })) > 0;
}

/** 某人某年度的逐条流水（按时间正序），作为回答里的引用依据 */
export async function listLeaveEntryRefs(userId: string, year: number): Promise<LedgerEntryRef[]> {
  const rows = await prisma.leaveLedger.findMany({
    where: { userId, year },
    orderBy: { createdAt: 'asc' },
    select: { delta: true, reason: true, createdAt: true },
  });
  return rows.map((row) => ({
    date: formatChinaTime(row.createdAt).slice(0, 10),
    reason: row.reason,
    delta: row.delta,
  }));
}

export async function appendLeaveEntry(input: {
  userId: string;
  year: number;
  delta: number;
  reason: string;
  kind: string;
  operatorId?: string | null;
}): Promise<void> {
  await prisma.leaveLedger.create({
    data: {
      id: newLeaveId(),
      userId: input.userId,
      year: input.year,
      delta: input.delta,
      reason: input.reason,
      kind: input.kind,
      operatorId: input.operatorId ?? null,
    },
  });
}

/**
 * 汇总列表：按（员工 + 年度）分组，余额=流水合计、最后更新时间=最新一笔流水。
 * 传 onlyUserId 时只查这个人（「我的年假」用，服务端强制限定，不接受前端传参）。
 */
export async function listLeaveSummaries(onlyUserId?: string): Promise<LeaveSummary[]> {
  const userWhere = onlyUserId ? { isGuest: false, id: onlyUserId } : { isGuest: false };
  const [users, entries] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        employeeNo: true,
      },
    }),
    prisma.leaveLedger.findMany({
      where: onlyUserId ? { userId: onlyUserId } : {},
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.userId}:${entry.year}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(entry);
    else grouped.set(key, [entry]);
  }

  const result: LeaveSummary[] = [];
  for (const user of users) {
    const own = [...grouped.entries()].filter(([key]) => key.startsWith(`${user.id}:`));
    if (own.length === 0) {
      result.push({
        userId: user.id,
        name: user.name || user.email || '未填写姓名',
        account: user.email,
        employeeNo: user.employeeNo,
        year: currentLeaveYear(),
        balance: null,
        updatedAt: null,
        entries: [],
      });
      continue;
    }
    for (const [key, rows] of own) {
      const year = Number(key.slice(user.id.length + 1));
      result.push({
        userId: user.id,
        name: user.name || user.email || '未填写姓名',
        account: user.email,
        employeeNo: user.employeeNo,
        year,
        balance: sumDeltas(rows),
        updatedAt: formatChinaTime(rows[rows.length - 1].createdAt),
        entries: rows.map((e) => ({
          id: e.id,
          delta: e.delta,
          reason: e.reason,
          kind: e.kind,
          createdAt: formatChinaTime(e.createdAt),
        })),
      });
    }
  }

  return result.sort((a, b) => {
    const noA = a.employeeNo ?? 'zzzz';
    const noB = b.employeeNo ?? 'zzzz';
    if (noA !== noB) return noA.localeCompare(noB);
    return b.year - a.year;
  });
}
