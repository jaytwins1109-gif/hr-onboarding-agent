// lib/workspace/access.ts
//
// 工作台权限的唯一裁决处（文档第 3 步红线：所有「谁能看什么、谁能做什么」
// 必须在系统内部检查，不能只靠隐藏按钮）。
//
// 这里只放纯函数，由服务端页面（app/workspace/*）与服务端接口
// （app/api/workspace/*）调用；浏览器拿到的只是渲染结果，不是判断过程。
// 注意：现有 /admin、/developer 的守卫在 lib/auth/guard.ts + middleware.ts，
// 与这套并行、互不影响。

import { normalizeRole, type UserRole } from '@/lib/auth/jwt';

/** 四角色的中文名，侧栏底部与后续所有页面共用这一份，避免各处写各的 */
export const WORKSPACE_ROLE_LABEL: Record<UserRole, string> = {
  USER: '员工',
  ADMIN: 'HR 管理员',
  PRODUCT_OPS: '产品运营',
  DEVELOPER: '系统管理员',
};

export const WORKSPACE_ROLES: UserRole[] = ['USER', 'ADMIN', 'PRODUCT_OPS', 'DEVELOPER'];

/** 非白名单 role 一律降为「员工」，绝不把库里的任意文本直接显示出来 */
export function workspaceRoleLabel(role?: string | null): string {
  return WORKSPACE_ROLE_LABEL[normalizeRole(role)];
}

export interface WorkspaceAccount {
  isActive: boolean;
  isGuest: boolean;
  role: string;
}

/**
 * 能否进入工作台：账号必须存在、已启用、不是游客。
 * 停用账号即使持有未过期的 JWT、直接敲 /workspace 地址，也会在这里被拒。
 */
export function canAccessWorkspace(user: WorkspaceAccount | null | undefined): boolean {
  return !!user && user.isActive && !user.isGuest;
}

/**
 * 「管理后台」登录标签的服务端放行口径：仅 HR 管理员 / 产品运营 / 系统管理员。
 * 员工用这个标签登录，即使账号密码正确也要被拒（不靠前端隐藏标签）。
 * 按角色自动进入不同空间属于文档阶段 12，本步不做分流。
 */
export function canEnterAdminConsole(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'ADMIN' || normalized === 'PRODUCT_OPS' || normalized === 'DEVELOPER';
}

/** 员工管理页 / 部门维护：仅 HR 管理员与系统管理员（产品运营不碰人事数据） */
export function canManageEmployees(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'ADMIN' || normalized === 'DEVELOPER';
}

/**
 * 新增员工时的角色权限（文档第 4 步）：
 * HR 管理员只能新增「员工」；系统管理员才能新增 HR 管理员 / 产品运营 / 系统管理员。
 * targetRole 必须是四角色白名单里的原值，非法值一律拒绝（不靠降级蒙混过关）。
 */
export function canCreateRole(actorRole?: string | null, targetRole?: string | null): boolean {
  if (!canManageEmployees(actorRole)) return false;
  if (!WORKSPACE_ROLES.includes(targetRole as UserRole)) return false;
  return normalizeRole(actorRole) === 'DEVELOPER' || targetRole === 'USER';
}

/** 新增/导入弹窗里允许选的角色（渲染用；真正的校验仍在服务端 canCreateRole） */
export function assignableRoles(actorRole?: string | null): UserRole[] {
  if (!canManageEmployees(actorRole)) return [];
  return normalizeRole(actorRole) === 'DEVELOPER' ? WORKSPACE_ROLES : ['USER'];
}

/** 年假管理后台：与员工管理同一批人（HR 管理员 / 系统管理员） */
export function canManageLeave(role?: string | null): boolean {
  return canManageEmployees(role);
}

/** 模型配置（文档第 14 步）：只有系统管理员能看到与修改 */
export function canConfigureModel(role?: string | null): boolean {
  return normalizeRole(role) === 'DEVELOPER';
}

/**
 * 「我的年假」的红线（文档第 12 步）：员工只能看自己的记录。
 * 即使知道别人的页面地址、或直接打接口带别人的 userId，也在这里被拒。
 * HR 管理员 / 系统管理员可在管理后台看全部。
 */
export function canViewLeave(actor: { id: string; role: string }, targetUserId: string): boolean {
  return actor.id === targetUserId || canManageLeave(actor.role);
}
