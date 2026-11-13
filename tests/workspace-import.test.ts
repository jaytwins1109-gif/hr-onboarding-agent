/**
 * 批量导入逐行校验单测（文档第 5 步）：预览只校验不写库，
 * 错误行必须给出中文原因，角色权限与编号重复的判定也在这里守住。
 */
import { describe, expect, it } from 'vitest';
import { csvTemplate, parseCsv, validateImportRows, type ImportRow } from '@/lib/workspace/import';
import { assignableRoles, canCreateRole } from '@/lib/workspace/access';

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  name: '李示例',
  employeeNo: 'CX-0001',
  department: '产品部',
  role: '员工',
  ...over,
});

describe('CSV 解析与模板', () => {
  it('模板带表头，解析时自动跳过', () => {
    expect(csvTemplate().split('\r\n')[0]).toBe('姓名,员工编号,部门,角色');
    expect(parseCsv(csvTemplate())).toHaveLength(2);
    expect(parseCsv(csvTemplate())[0]).toEqual({
      name: '李示例',
      employeeNo: 'CX-0001',
      department: '产品部',
      role: '员工',
    });
  });
});

describe('validateImportRows 逐行校验', () => {
  it('合法行通过；错误行各自给出中文原因', () => {
    const checked = validateImportRows(
      [
        row(),
        row({ employeeNo: 'CX-0002', department: '' }),
        row({ employeeNo: 'CX-0003', role: '不存在的角色' }),
        row({ employeeNo: 'CX-0001' }),
        row({ employeeNo: '', name: '王示例' }),
      ],
      [],
      'DEVELOPER',
    );
    expect(checked.map((c) => c.ok)).toEqual([true, false, false, false, false]);
    expect(checked.map((c) => c.reason)).toEqual([
      '',
      '部门为空',
      '角色不合法',
      '员工编号重复',
      '员工编号为空',
    ]);
  });

  it('库里已有的编号也算重复', () => {
    const checked = validateImportRows([row()], ['CX-0001'], 'DEVELOPER');
    expect(checked[0].reason).toBe('员工编号重复');
  });

  it('HR 管理员只能导入员工角色，系统管理员可导入全部四角色', () => {
    expect(validateImportRows([row({ role: 'HR 管理员' })], [], 'ADMIN')[0].reason).toBe(
      '当前账号无权新增该角色',
    );
    expect(validateImportRows([row({ role: '产品运营' })], [], 'DEVELOPER')[0].ok).toBe(true);
    expect(assignableRoles('ADMIN')).toEqual(['USER']);
    expect(assignableRoles('DEVELOPER')).toHaveLength(4);
    expect(canCreateRole('USER', 'USER')).toBe(false);
  });
});
