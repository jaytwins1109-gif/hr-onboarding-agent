// lib/workspace/session.ts
//
// 工作台服务端会话：每个 /workspace/* 页面与 /api/workspace/* 接口都从这里拿当前账号，
// 不再各写一份「验票 → 查库 → 判断启用」的逻辑（判断口径必须只有一处）。

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';
import { canAccessWorkspace, workspaceRoleLabel } from './access';

export interface WorkspaceViewer {
  id: string;
  name: string | null;
  email: string | null;
  employeeNo: string | null;
  department: string | null;
  role: string;
  roleLabel: string;
  isActive: boolean;
}

/** 未登录 / 票据伪造 / 账号被停用 / 游客行 → 一律 null */
export async function getWorkspaceViewer(): Promise<WorkspaceViewer | null> {
  const ticket = await verifyUserToken((await cookies()).get(TOKEN_COOKIE)?.value);
  if (!ticket) return null;
  const user = await prisma.user.findUnique({
    where: { id: ticket.userId },
    select: {
      id: true,
      name: true,
      email: true,
      employeeNo: true,
      department: true,
      role: true,
      isActive: true,
      isGuest: true,
    },
  });
  if (!user || !canAccessWorkspace(user)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeNo: user.employeeNo,
    department: user.department,
    role: user.role,
    roleLabel: workspaceRoleLabel(user.role),
    isActive: user.isActive,
  };
}

/** 页面用：拿不到合法账号就回工作台入口（那里会显示登录引导或停用提示） */
export async function requireWorkspaceViewer(): Promise<WorkspaceViewer> {
  const viewer = await getWorkspaceViewer();
  if (!viewer) redirect('/workspace');
  return viewer;
}
