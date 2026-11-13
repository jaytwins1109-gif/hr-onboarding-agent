// app/workspace/employees/page.tsx — 员工管理（文档第 4 步）
//
// 服务端先判权限：不是 HR 管理员 / 系统管理员，即使直接敲地址也只看到「无权」卡片。
// 列表数据在服务端查库后交给客户端表格，前端不做权限判断。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import {
  assignableRoles,
  canConfigureModel,
  canManageEmployees,
  WORKSPACE_ROLE_LABEL,
} from '@/lib/workspace/access';
import { listDepartments } from '@/lib/workspace/departments';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { EmployeeManager, type EmployeeRow } from './_components/employee-manager';

export const metadata: Metadata = { title: '员工管理 · 初见 ONBOARD' };

export default async function EmployeesPage() {
  const viewer = await requireWorkspaceViewer();
  const allowed = canManageEmployees(viewer.role);
  const shellProps = {
    name: viewer.name?.trim() || viewer.email || '未填写姓名',
    department: viewer.department?.trim() || '未设置',
    roleLabel: viewer.roleLabel,
    active: 'employees' as const,
    pageTitle: '员工管理',
    canManage: allowed,
    canConfigureModel: canConfigureModel(viewer.role),
  };

  if (!allowed) {
    return (
      <WorkspaceShell {...shellProps}>
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">当前账号无权进入员工管理</h2>
          <p className="mt-2 text-sm text-slate-600">
            员工管理仅对 HR 管理员与系统管理员开放，请联系管理员确认账号角色。
          </p>
        </section>
      </WorkspaceShell>
    );
  }

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: { isGuest: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        employeeNo: true,
        department: true,
        role: true,
        isActive: true,
      },
    }),
    listDepartments(),
  ]);

  const rows: EmployeeRow[] = users.map((u) => ({
    id: u.id,
    name: u.name || u.email || '未填写姓名',
    account: u.email,
    employeeNo: u.employeeNo,
    department: u.department,
    role: u.role,
    isActive: u.isActive,
  }));

  const roles = assignableRoles(viewer.role).map((code) => ({
    code,
    label: WORKSPACE_ROLE_LABEL[code],
  }));

  return (
    <WorkspaceShell {...shellProps}>
      <EmployeeManager initial={rows} departments={departments} roles={roles} />
    </WorkspaceShell>
  );
}
