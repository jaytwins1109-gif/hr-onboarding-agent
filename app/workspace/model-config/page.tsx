// app/workspace/model-config/page.tsx — 模型配置（文档第 14 步，仅系统管理员）

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { clientConfigFromRow } from '@/lib/workspace/model-config';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { ModelConfigPanel } from './_components/model-config-panel';

export const metadata: Metadata = { title: '模型配置 · 初见 ONBOARD' };

export default async function ModelConfigPage() {
  const viewer = await requireWorkspaceViewer();
  const allowed = canConfigureModel(viewer.role);
  const shellProps = {
    name: viewer.name?.trim() || viewer.email || '未填写姓名',
    department: viewer.department?.trim() || '未设置',
    roleLabel: viewer.roleLabel,
    active: 'model-config' as const,
    pageTitle: '模型配置',
    canManage: canManageEmployees(viewer.role),
    canConfigureModel: allowed,
  };

  if (!allowed) {
    return (
      <WorkspaceShell {...shellProps}>
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">当前账号无权进入模型配置</h2>
          <p className="mt-2 text-sm text-slate-600">
            模型配置仅对系统管理员开放，请联系管理员确认账号角色。
          </p>
        </section>
      </WorkspaceShell>
    );
  }

  const row = await prisma.modelConfig.findUnique({ where: { id: 'default' } });
  return (
    <WorkspaceShell {...shellProps}>
      <ModelConfigPanel initial={clientConfigFromRow(row)} />
    </WorkspaceShell>
  );
}
