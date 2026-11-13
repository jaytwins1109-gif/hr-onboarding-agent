// app/workspace/my-leave/page.tsx — 我的年假（文档第 12 步）
//
// 服务端只查 viewer.id 的流水，不把「查谁」暴露给前端参数：
// 员工即使知道别人的页面地址，也拿不到别人的记录。

import type { Metadata } from 'next';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { listLeaveSummaries } from '@/lib/workspace/leave-store';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { MyLeave } from './_components/my-leave';

export const metadata: Metadata = { title: '我的年假 · 初见 ONBOARD' };

export default async function MyLeavePage() {
  const viewer = await requireWorkspaceViewer();
  const summaries = await listLeaveSummaries(viewer.id);
  return (
    <WorkspaceShell
      name={viewer.name?.trim() || viewer.email || '未填写姓名'}
      department={viewer.department?.trim() || '未设置'}
      roleLabel={viewer.roleLabel}
      active="my-leave"
      pageTitle="我的年假"
      canManage={canManageEmployees(viewer.role)}
      canConfigureModel={canConfigureModel(viewer.role)}
    >
      <MyLeave initial={summaries} />
    </WorkspaceShell>
  );
}
