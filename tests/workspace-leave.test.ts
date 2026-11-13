/**
 * 年假台账规则单测（文档第 11~13 步）：
 * 天数/年度异常输入必须给中文原因；余额恒等于流水合计；
 * 导入只生成对账差额；员工只能看自己的记录。
 */
import { describe, expect, it } from 'vitest';
import { canManageLeave, canViewLeave } from '@/lib/workspace/access';
import {
  currentLeaveYear,
  formatDays,
  leaveTemplate,
  parseAdjustDays,
  parseBalanceDays,
  parseLeaveCsv,
  parseLeaveYear,
  reconcileDelta,
  sumDeltas,
  validateLeaveImportRows,
  type LeaveImportRow,
  type LeaveImportUser,
} from '@/lib/workspace/leave';

const users: LeaveImportUser[] = [
  { id: 'u1', employeeNo: 'CX-0001', name: '李知微' },
  { id: 'u2', employeeNo: 'CX-0002', name: '陈望舒' },
];
const row = (over: Partial<LeaveImportRow> = {}): LeaveImportRow => ({
  employeeNo: 'CX-0001',
  name: '李知微',
  year: '2026',
  days: '7.5',
  ...over,
});

describe('天数与年度输入闸门', () => {
  it('余额天数接受 0 / 整数 / 0.5 倍数', () => {
    expect(parseBalanceDays('0').ok).toBe(true);
    expect(parseBalanceDays('5').value).toBe(5);
    expect(parseBalanceDays('7.5').value).toBe(7.5);
    expect(parseBalanceDays(12).value).toBe(12);
  });

  it('空值、字母、非 0.5 倍数、负数、超限都被拒绝并给出中文原因', () => {
    expect(parseBalanceDays('').error).toBe('天数不能为空');
    expect(parseBalanceDays('abc').error).toContain('必须是数字');
    expect(parseBalanceDays('2.3').error).toContain('0.5 天');
    expect(parseBalanceDays('-1').error).toBe('剩余天数不能为负数');
    expect(parseBalanceDays('61').error).toContain('不能超过');
    expect(parseBalanceDays('Infinity').ok).toBe(false);
  });

  it('调整天数可增可减，但不能为 0、字母或超过 30 天', () => {
    expect(parseAdjustDays('2').value).toBe(2);
    expect(parseAdjustDays('-1.5').value).toBe(-1.5);
    expect(parseAdjustDays('0').error).toBe('调整天数不能为 0');
    expect(parseAdjustDays('abc').ok).toBe(false);
    expect(parseAdjustDays('31').error).toContain('不能超过');
  });

  it('年度必须是 4 位数字且在合理范围', () => {
    expect(parseLeaveYear('2026').value).toBe(2026);
    expect(parseLeaveYear('').error).toBe('年度不能为空');
    expect(parseLeaveYear('26').error).toContain('4 位数字');
    expect(parseLeaveYear('abcd').error).toContain('4 位数字');
    expect(parseLeaveYear('1999').error).toContain('之间');
  });

  it('演示年度按北京时间，跨年当天不会算错', () => {
    expect(currentLeaveYear(new Date('2025-12-31T20:00:00Z'))).toBe(2026);
    expect(currentLeaveYear(new Date('2026-06-01T00:00:00Z'))).toBe(2026);
  });
});

describe('余额聚合与对账', () => {
  it('余额恒等于全部流水合计，浮点尾巴会被抹平', () => {
    expect(sumDeltas([{ delta: 5 }, { delta: -2 }, { delta: 0.5 }])).toBe(3.5);
    expect(sumDeltas([])).toBe(0);
    expect(sumDeltas([{ delta: 0.1 }, { delta: 0.2 }])).toBe(0.3);
  });

  it('导入与现有余额不一致时只补差额，不覆盖历史', () => {
    expect(reconcileDelta(5, 7.5)).toBe(2.5);
    expect(reconcileDelta(7.5, 5)).toBe(-2.5);
    expect(reconcileDelta(5, 5)).toBe(0);
    expect(reconcileDelta(0, 0)).toBe(0);
  });

  it('天数展示不带多余小数', () => {
    expect(formatDays(5)).toBe('5');
    expect(formatDays(7.5)).toBe('7.5');
  });
});

describe('导入模板与逐行校验', () => {
  it('模板带表头，解析时自动跳过', () => {
    expect(leaveTemplate().split('\r\n')[0]).toBe('员工编号,姓名,年度,剩余天数');
    expect(parseLeaveCsv(`\uFEFF${leaveTemplate()}`)).toHaveLength(2);
    expect(parseLeaveCsv(leaveTemplate())[0]).toEqual({
      employeeNo: 'CX-0001',
      name: '李知微',
      year: '2026',
      days: '7.5',
    });
  });

  it('合法行带出 userId / 年度 / 天数，供确认写入用', () => {
    const checked = validateLeaveImportRows([row()], users);
    expect(checked[0]).toMatchObject({
      ok: true,
      reason: '',
      userId: 'u1',
      year: 2026,
      days: 7.5,
    });
  });

  it('错误行各自给出中文原因，且不掺进写入数据', () => {
    const checked = validateLeaveImportRows(
      [
        row(),
        row({ employeeNo: '' }),
        row({ employeeNo: 'CX-9999' }),
        row({ year: '26' }),
        row({ days: 'abc' }),
        row({ days: '-1' }),
        row({ employeeNo: 'CX-0002', year: '2026' }),
        row({ employeeNo: 'CX-0002', year: '2026' }),
      ],
      users,
    );
    expect(checked.map((c) => c.ok)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(checked.map((c) => c.reason)).toEqual([
      '',
      '员工编号为空',
      '找不到这个员工编号',
      '年度必须是 4 位数字',
      '天数必须是数字，不能包含字母或符号',
      '剩余天数不能为负数',
      '',
      '同一员工同一年度重复',
    ]);
    expect(checked[1].userId).toBeNull();
    expect(checked[1].days).toBeNull();
  });
});

describe('年假权限红线', () => {
  it('HR 管理员与系统管理员可管理，员工与产品运营不可', () => {
    expect(canManageLeave('ADMIN')).toBe(true);
    expect(canManageLeave('DEVELOPER')).toBe(true);
    expect(canManageLeave('USER')).toBe(false);
    expect(canManageLeave('PRODUCT_OPS')).toBe(false);
  });

  it('员工只能看自己；管理员可以看别人', () => {
    expect(canViewLeave({ id: 'u1', role: 'USER' }, 'u1')).toBe(true);
    expect(canViewLeave({ id: 'u1', role: 'USER' }, 'u2')).toBe(false);
    expect(canViewLeave({ id: 'u1', role: 'PRODUCT_OPS' }, 'u2')).toBe(false);
    expect(canViewLeave({ id: 'admin', role: 'ADMIN' }, 'u2')).toBe(true);
    expect(canViewLeave({ id: 'admin', role: 'DEVELOPER' }, 'u2')).toBe(true);
  });
});
