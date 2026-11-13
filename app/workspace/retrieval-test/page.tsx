// app/workspace/retrieval-test/page.tsx — 查找测试（文档第 16 步第 5 条，仅管理员）
//
// 菜单隐藏只是体验层：页面与 /api/workspace/retrieval 都调 canUseRetrievalTest，
// 直接敲地址或用员工账号调接口一样会被拒。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageEmployees, canUseRetrievalTest } from '@/lib/workspace/access';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { RetrievalTestClient } from './_components/retrieval-test-client';

export const metadata: Metadata = { title: '查找测试 · 初见 ONBOARD' };

export default async function RetrievalTestPage() {
  const viewer = await requireWorkspaceViewer();
  const allowed = canUseRetrievalTest(viewer.role);
  const departments = allowed
    ? (await prisma.department.findMany({ orderBy: { name: 'asc' }, select: { name: true } })).map(
        (row) => row.name,
      )
    : [];

  return (
    <WorkspaceShell
      name={viewer.name?.trim() || viewer.email || '未填写姓名'}
      department={viewer.department?.trim() || '未设置'}
      roleLabel={viewer.roleLabel}
      active="retrieval-test"
      pageTitle="查找测试"
      canManage={canManageEmployees(viewer.role)}
      canConfigureModel={canConfigureModel(viewer.role)}
    >
      {allowed ? (
        <RetrievalTestClient
          departments={departments}
          defaultDepartment={viewer.department?.trim() || ''}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">当前账号无权使用查找测试</h2>
          <p className="mt-2 text-sm text-slate-600">
            这个小页面仅供管理员验收制度检索。请返回工作台，或用管理员账号登录后再试。
          </p>
        </section>
      )}
    </WorkspaceShell>
  );
}
