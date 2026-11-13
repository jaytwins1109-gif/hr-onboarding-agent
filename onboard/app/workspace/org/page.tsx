// app/workspace/org/page.tsx — 组织架构（文档第 6 步）
//
// 只做「公司 → 部门 → 启用成员」的目录：现有数据没有上下级汇报关系，
// 不画管理汇报线，也不编造职位。管理员可在页面上新增部门、跳到员工管理。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { listDepartments } from '@/lib/workspace/departments';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { OrgView, type OrgGroup } from './_components/org-view';

export const metadata: Metadata = { title: '组织架构 · 初见 ONBOARD' };

export default async function OrgPage() {
  const viewer = await requireWorkspaceViewer();
  const canManage = canManageEmployees(viewer.role);
  const [departments, users] = await Promise.all([
    listDepartments(),
    prisma.user.findMany({
      where: { isGuest: false, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, department: true },
    }),
  ]);

  const member = (u: (typeof users)[number]) => ({
    id: u.id,
    name: u.name?.trim() || u.email || '未填写姓名',
  });
  const groups: OrgGroup[] = departments.map((name) => ({
    name,
    members: users.filter((u) => u.department === name).map(member),
  }));
  const unassigned = users.filter((u) => !u.department || !departments.includes(u.department));
  if (unassigned.length) {
    groups.push({ name: '未设置部门', members: unassigned.map(member) });
  }

  return (
    <WorkspaceShell
      name={viewer.name?.trim() || viewer.email || '未填写姓名'}
      department={viewer.department?.trim() || '未设置'}
      roleLabel={viewer.roleLabel}
      active="org"
      pageTitle="组织架构"
      canManage={canManage}
      canConfigureModel={canConfigureModel(viewer.role)}
    >
      <OrgView groups={groups} canManage={canManage} />
    </WorkspaceShell>
  );
}
