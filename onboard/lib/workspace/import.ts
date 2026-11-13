// lib/workspace/import.ts
//
// 批量导入的 CSV 解析与逐行校验（文档第 5 步）。纯函数，前后端与单测共用一套规则：
// 预览阶段只校验不写库；确认导入时只写「通过」的行，错误行原样跳过。

import type { UserRole } from '@/lib/auth/jwt';
import { canCreateRole } from './access';

export interface ImportRow {
  name: string;
  employeeNo: string;
  department: string;
  role: string;
}

export interface CheckedRow {
  index: number;
  row: ImportRow;
  ok: boolean;
  reason: string;
}

export const CSV_HEADER = '姓名,员工编号,部门,角色';

/** 模板里角色可写中文名，也可写系统代码，避免用户猜格式 */
export const ROLE_BY_LABEL: Record<string, UserRole> = {
  员工: 'USER',
  'HR 管理员': 'ADMIN',
  产品运营: 'PRODUCT_OPS',
  系统管理员: 'DEVELOPER',
  USER: 'USER',
  ADMIN: 'ADMIN',
  PRODUCT_OPS: 'PRODUCT_OPS',
  DEVELOPER: 'DEVELOPER',
};

/** 简易 CSV 解析：模板只有四列纯文本，不引入第三方库 */
export function parseCsv(text: string): ImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length && lines[0].includes('姓名')) lines.shift();
  return lines.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    return {
      name: cells[0] ?? '',
      employeeNo: cells[1] ?? '',
      department: cells[2] ?? '',
      role: cells[3] ?? '',
    };
  });
}

/** 返回与输入等长的逐行结果，界面直接按 index 展示「是否通过 + 原因」 */
export function validateImportRows(
  rows: ImportRow[],
  existingNos: string[],
  actorRole: string,
): CheckedRow[] {
  const seen = new Set(existingNos.map((no) => no.trim()));
  return rows.map((raw, index) => {
    const row: ImportRow = {
      name: raw.name.trim(),
      employeeNo: raw.employeeNo.trim(),
      department: raw.department.trim(),
      role: raw.role.trim(),
    };
    const fail = (reason: string): CheckedRow => ({ index, row, ok: false, reason });
    if (!row.name) return fail('姓名为空');
    if (!row.employeeNo) return fail('员工编号为空');
    if (!row.department) return fail('部门为空');
    const target = ROLE_BY_LABEL[row.role];
    if (!target) return fail('角色不合法');
    if (!canCreateRole(actorRole, target)) return fail('当前账号无权新增该角色');
    if (seen.has(row.employeeNo)) return fail('员工编号重复');
    seen.add(row.employeeNo);
    return { index, row, ok: true, reason: '' };
  });
}

export function csvTemplate(): string {
  return [CSV_HEADER, '李示例,CX-0001,产品部,员工', '王示例,CX-0002,技术部,员工'].join('\r\n');
}
