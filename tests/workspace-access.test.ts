/**
 * 工作台四角色与服务端权限闸门单测（文档第 3 步）。
 *
 * 重点：权限判断是纯函数、只在服务端调用；停用账号、游客、非法 role
 * 一律被拒或降级，不依赖前端是否隐藏了入口。
 */
import { describe, expect, it } from 'vitest';
import { normalizeRole } from '@/lib/auth/jwt';
import {
  canAccessWorkspace,
  canEnterAdminConsole,
  workspaceRoleLabel,
  WORKSPACE_ROLE_LABEL,
} from '@/lib/workspace/access';

describe('四角色中文名与白名单归一', () => {
  it('四个角色都有中文名', () => {
    expect(Object.keys(WORKSPACE_ROLE_LABEL)).toEqual([
      'USER',
      'ADMIN',
      'PRODUCT_OPS',
      'DEVELOPER',
    ]);
    expect(workspaceRoleLabel('USER')).toBe('员工');
    expect(workspaceRoleLabel('ADMIN')).toBe('HR 管理员');
    expect(workspaceRoleLabel('PRODUCT_OPS')).toBe('产品运营');
    expect(workspaceRoleLabel('DEVELOPER')).toBe('系统管理员');
  });

  it('库里的非法/空角色一律降为员工，不把任意文本显示到界面', () => {
    expect(normalizeRole('SUPER_ADMIN')).toBe('USER');
    expect(normalizeRole(null)).toBe('USER');
    expect(workspaceRoleLabel('SUPER_ADMIN')).toBe('员工');
    expect(workspaceRoleLabel()).toBe('员工');
  });
});

describe('canAccessWorkspace（服务端访问闸门）', () => {
  const active = { isActive: true, isGuest: false, role: 'USER' };
  it('已启用的正式账号可进入', () => {
    expect(canAccessWorkspace(active)).toBe(true);
  });
  it('停用账号即使持有效票据也被拒', () => {
    expect(canAccessWorkspace({ ...active, isActive: false })).toBe(false);
  });
  it('游客行、不存在的账号被拒', () => {
    expect(canAccessWorkspace({ ...active, isGuest: true })).toBe(false);
    expect(canAccessWorkspace(null)).toBe(false);
    expect(canAccessWorkspace(undefined)).toBe(false);
  });
});

describe('canEnterAdminConsole（管理后台标签的服务端校验）', () => {
  it('HR 管理员 / 产品运营 / 系统管理员放行', () => {
    for (const role of ['ADMIN', 'PRODUCT_OPS', 'DEVELOPER']) {
      expect(canEnterAdminConsole(role)).toBe(true);
    }
  });
  it('员工、非法角色、空值一律拒绝', () => {
    for (const role of ['USER', 'SUPER_ADMIN', '', null, undefined]) {
      expect(canEnterAdminConsole(role)).toBe(false);
    }
  });
});
