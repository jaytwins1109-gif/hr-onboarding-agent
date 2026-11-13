/**
 * 制度可见性唯一规则的矩阵测试（文档第 9 步第 5 条）：
 * 列表 / 详情 / 下载 / 之后的问答必须共用 canViewPolicy。
 */
import { describe, expect, it } from 'vitest';
import { canViewPolicy, scopeLabel, todayInChina } from '@/lib/workspace/policies';

const NOW = new Date('2026-11-13T02:00:00.000Z'); // 北京时间 2026-11-13 10:00
const base = {
  status: 'published',
  effectiveDate: '2026-01-01',
  scope: 'all',
};

describe('canViewPolicy（唯一一套可见性规则）', () => {
  it('已发布 + 已生效 + 全员 → 任何部门可见，未设置部门也可见', () => {
    expect(canViewPolicy(base, '产品部', NOW)).toBe(true);
    expect(canViewPolicy(base, null, NOW)).toBe(true);
  });

  it('未发布 / 已下架 / 解析中一律不可见', () => {
    for (const status of ['queued', 'parsing', 'pending', 'failed', 'archived']) {
      expect(canViewPolicy({ ...base, status }, '产品部', NOW)).toBe(false);
    }
  });

  it('生效日期在未来 → 不可见；当天生效 → 可见', () => {
    expect(canViewPolicy({ ...base, effectiveDate: '2026-11-14' }, '产品部', NOW)).toBe(false);
    expect(canViewPolicy({ ...base, effectiveDate: todayInChina(NOW) }, '产品部', NOW)).toBe(true);
  });

  it('部门专属：本部门可见、其他部门与未设置部门不可见', () => {
    const scoped = { ...base, scope: '产品部' };
    expect(canViewPolicy(scoped, '产品部', NOW)).toBe(true);
    expect(canViewPolicy(scoped, '技术部', NOW)).toBe(false);
    expect(canViewPolicy(scoped, null, NOW)).toBe(false);
  });

  it('范围标签文案', () => {
    expect(scopeLabel('all')).toBe('全员可见');
    expect(scopeLabel('产品部')).toBe('产品部专属');
  });
});
