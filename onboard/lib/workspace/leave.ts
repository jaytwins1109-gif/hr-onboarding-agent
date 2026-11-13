// lib/workspace/leave.ts
//
// 年假台账的纯规则（文档第 11~13 步）：CSV 解析、逐行校验、天数/年度口径、
// 余额聚合与对账差额。前后端与单测共用这一份，服务端接口不另写一套。
// 这里刻意不 import prisma / access，客户端组件也能安全引用。

export const LEAVE_CSV_HEADER = '员工编号,姓名,年度,剩余天数';
export const MAX_BALANCE_DAYS = 60;
export const MAX_ADJUST_DAYS = 30;
export const MIN_LEAVE_YEAR = 2000;
export const MAX_LEAVE_YEAR = 2100;

export interface LeaveImportRow {
  employeeNo: string;
  name: string;
  year: string;
  days: string;
}

export interface LeaveImportUser {
  id: string;
  employeeNo: string | null;
  name: string | null;
}

export interface CheckedLeaveRow {
  index: number;
  row: LeaveImportRow;
  ok: boolean;
  reason: string;
  userId: string | null;
  year: number | null;
  days: number | null;
}

export interface ParsedNumber {
  ok: boolean;
  value: number;
  error: string;
}

/** 台账展示用的形状（纯类型，客户端组件可安全 import type） */
export interface LeaveEntry {
  id: string;
  delta: number;
  reason: string;
  kind: string;
  createdAt: string;
}

export interface LeaveSummary {
  userId: string;
  name: string;
  account: string | null;
  employeeNo: string | null;
  year: number;
  balance: number | null;
  updatedAt: string | null;
  entries: LeaveEntry[];
}

/** 统一的数字闸门：空值、字母、非 0.5 倍数一律给中文原因，绝不静默转成 0 */
function parseDays(raw: unknown): ParsedNumber {
  const text = (typeof raw === 'number' ? String(raw) : String(raw ?? '')).trim();
  if (!text) return { ok: false, value: 0, error: '天数不能为空' };
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return { ok: false, value: 0, error: '天数必须是数字，不能包含字母或符号' };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, value: 0, error: '天数必须是有效数字' };
  }
  if (Math.abs(value * 2 - Math.round(value * 2)) > 1e-9) {
    return { ok: false, value: 0, error: '天数必须是 0.5 天的整数倍' };
  }
  return { ok: true, value, error: '' };
}

/** 导入余额：非负、有上限；0 是合法值（HR 明确确认过余额为零） */
export function parseBalanceDays(raw: unknown): ParsedNumber {
  const parsed = parseDays(raw);
  if (!parsed.ok) return parsed;
  if (parsed.value < 0) return { ok: false, value: 0, error: '剩余天数不能为负数' };
  if (parsed.value > MAX_BALANCE_DAYS) {
    return { ok: false, value: 0, error: `剩余天数不能超过 ${MAX_BALANCE_DAYS} 天` };
  }
  return parsed;
}

/** 手动调整：可增可减，但不能为 0、不能一次改太多 */
export function parseAdjustDays(raw: unknown): ParsedNumber {
  const parsed = parseDays(raw);
  if (!parsed.ok) return parsed;
  if (parsed.value === 0) return { ok: false, value: 0, error: '调整天数不能为 0' };
  if (Math.abs(parsed.value) > MAX_ADJUST_DAYS) {
    return { ok: false, value: 0, error: `单次调整不能超过 ${MAX_ADJUST_DAYS} 天` };
  }
  return parsed;
}

export function parseLeaveYear(raw: unknown): ParsedNumber {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, value: 0, error: '年度不能为空' };
  if (!/^\d{4}$/.test(text)) return { ok: false, value: 0, error: '年度必须是 4 位数字' };
  const value = Number(text);
  if (value < MIN_LEAVE_YEAR || value > MAX_LEAVE_YEAR) {
    return { ok: false, value: 0, error: `年度需在 ${MIN_LEAVE_YEAR} 到 ${MAX_LEAVE_YEAR} 之间` };
  }
  return { ok: true, value, error: '' };
}

/** 余额恒等于流水合计，保留一位小数避免浮点尾巴（如 0.1+0.2） */
export function sumDeltas(entries: { delta: number }[]): number {
  const total = entries.reduce((sum, e) => sum + e.delta, 0);
  return Math.round(total * 10) / 10;
}

/** 导入余额与现有余额不一致时，只补一条对账流水，不覆盖任何历史 */
export function reconcileDelta(current: number, target: number): number {
  return Math.round((target - current) * 10) / 10;
}

export function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 演示与默认年度用北京时间，避免跨年当天算错年 */
export function currentLeaveYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(now),
  );
}

export function parseLeaveCsv(text: string): LeaveImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length && lines[0].includes('员工编号')) lines.shift();
  return lines.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    return {
      employeeNo: cells[0] ?? '',
      name: cells[1] ?? '',
      year: cells[2] ?? '',
      days: cells[3] ?? '',
    };
  });
}

/** 返回与输入等长的逐行结果；姓名只用于展示，以员工编号为唯一匹配键 */
export function validateLeaveImportRows(
  rows: LeaveImportRow[],
  users: LeaveImportUser[],
): CheckedLeaveRow[] {
  const byNo = new Map<string, LeaveImportUser>();
  for (const u of users) {
    if (u.employeeNo) byNo.set(u.employeeNo.trim(), u);
  }
  const seen = new Set<string>();
  return rows.map((raw, index) => {
    const row: LeaveImportRow = {
      employeeNo: raw.employeeNo.trim(),
      name: raw.name.trim(),
      year: raw.year.trim(),
      days: raw.days.trim(),
    };
    const fail = (reason: string): CheckedLeaveRow => ({
      index,
      row,
      ok: false,
      reason,
      userId: null,
      year: null,
      days: null,
    });
    if (!row.employeeNo) return fail('员工编号为空');
    const user = byNo.get(row.employeeNo);
    if (!user) return fail('找不到这个员工编号');
    const year = parseLeaveYear(row.year);
    if (!year.ok) return fail(year.error);
    const days = parseBalanceDays(row.days);
    if (!days.ok) return fail(days.error);
    const key = `${user.id}:${year.value}`;
    if (seen.has(key)) return fail('同一员工同一年度重复');
    seen.add(key);
    return {
      index,
      row,
      ok: true,
      reason: '',
      userId: user.id,
      year: year.value,
      days: days.value,
    };
  });
}

export function leaveTemplate(): string {
  return [LEAVE_CSV_HEADER, 'CX-0001,李知微,2026,7.5', 'CX-0002,陈望舒,2026,5'].join('\r\n');
}
