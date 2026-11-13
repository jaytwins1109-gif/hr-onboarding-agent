// app/workspace/policy-center/page.tsx — 制度中心（文档第 9 步，所有已登录成员可见）
//
// 列表与后面的详情/下载接口共用 lib/workspace/policies.ts 的 canViewPolicy，
// 不在这里另写一套权限规则。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { canViewPolicy } from '@/lib/workspace/policies';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { PolicyCenter } from './_components/policy-center';

export const metadata: Metadata = { title: '制度中心 · 初见 ONBOARD' };

export default async function PolicyCenterPage() {
  const viewer = await requireWorkspaceViewer();
  const published = await prisma.policyDocument.findMany({
    where: { status: 'published' },
    orderBy: { effectiveDate: 'desc' },
    select: {
      id: true,
      name: true,
      category: true,
      scope: true,
      version: true,
      effectiveDate: true,
      status: true,
    },
  });
  // 唯一一套规则：已发布 + 生效日期已到 + 全员或本人部门
  const visible = published.filter((p) => canViewPolicy(p, viewer.department));

  return (
    <WorkspaceShell
      name={viewer.name?.trim() || viewer.email || '未填写姓名'}
      department={viewer.department?.trim() || '未设置'}
      roleLabel={viewer.roleLabel}
      active="policy-center"
      pageTitle="制度中心"
      canManage={canManageEmployees(viewer.role)}
      canConfigureModel={canConfigureModel(viewer.role)}
    >
      <PolicyCenter policies={visible} department={viewer.department?.trim() || '未设置'} />
    </WorkspaceShell>
  );
}
