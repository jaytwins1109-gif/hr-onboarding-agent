// app/workspace/policies/page.tsx — 制度知识库（文档第 8 步，仅 HR 管理员 / 系统管理员）

import type { Metadata } from 'next';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { listDepartments } from '@/lib/workspace/departments';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { PolicyLibrary } from './_components/policy-library';

export const metadata: Metadata = { title: '制度知识库 · 初见 ONBOARD' };

export default async function PoliciesPage() {
  const viewer = await requireWorkspaceViewer();
  const allowed = canManageEmployees(viewer.role);
  const shellProps = {
    name: viewer.name?.trim() || viewer.email || '未填写姓名',
    department: viewer.department?.trim() || '未设置',
    roleLabel: viewer.roleLabel,
    active: 'policies' as const,
    pageTitle: '制度知识库',
    canManage: allowed,
    canConfigureModel: canConfigureModel(viewer.role),
  };

  if (!allowed) {
    return (
      <WorkspaceShell {...shellProps}>
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">当前账号无权进入制度知识库</h2>
          <p className="mt-2 text-sm text-slate-600">
            制度上传与发布仅对 HR 管理员与系统管理员开放。
          </p>
        </section>
      </WorkspaceShell>
    );
  }

  const departments = await listDepartments();
  return (
    <WorkspaceShell {...shellProps}>
      <PolicyLibrary departments={departments} />
    </WorkspaceShell>
  );
}
