// app/workspace/leave/page.tsx — 年假管理（文档第 11 步，仅 HR 管理员 / 系统管理员）

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageLeave } from '@/lib/workspace/access';
import { currentLeaveYear } from '@/lib/workspace/leave';
import { listLeaveSummaries } from '@/lib/workspace/leave-store';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { LeaveAdmin } from './_components/leave-admin';

export const metadata: Metadata = { title: '年假管理 · 初见 ONBOARD' };

export default async function LeavePage() {
  const viewer = await requireWorkspaceViewer();
  const allowed = canManageLeave(viewer.role);
  const shellProps = {
    name: viewer.name?.trim() || viewer.email || '未填写姓名',
    department: viewer.department?.trim() || '未设置',
    roleLabel: viewer.roleLabel,
    active: 'leave' as const,
    pageTitle: '年假管理',
    canManage: allowed,
    canConfigureModel: canConfigureModel(viewer.role),
  };

  if (!allowed) {
    return (
      <WorkspaceShell {...shellProps}>
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">当前账号无权进入年假管理</h2>
          <p className="mt-2 text-sm text-slate-600">
            年假管理仅对 HR 管理员与系统管理员开放；查看本人余额请去「我的年假」。
          </p>
        </section>
      </WorkspaceShell>
    );
  }

  const [summaries, users] = await Promise.all([
    listLeaveSummaries(),
    prisma.user.findMany({
      where: { isGuest: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, employeeNo: true },
    }),
  ]);
  const employees = users.map((u) => ({
    id: u.id,
    label: `${u.name || u.email || '未填写姓名'}（${u.employeeNo || u.email || u.id}）`,
  }));

  return (
    <WorkspaceShell {...shellProps}>
      <LeaveAdmin initial={summaries} employees={employees} currentYear={currentLeaveYear()} />
    </WorkspaceShell>
  );
}
