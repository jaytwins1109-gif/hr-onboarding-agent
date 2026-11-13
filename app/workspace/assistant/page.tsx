// app/workspace/assistant/page.tsx — 员工服务助手（文档第 15 步）
//
// 侧栏「最近咨询」与整段对话都在服务端按当前登录账号过滤，
// 浏览器拿不到别人的会话，即使手工改网址里的 c 参数也一样。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { canConfigureModel, canManageEmployees } from '@/lib/workspace/access';
import { MAX_RECENT_CONSULTATIONS } from '@/lib/workspace/consultations';
import { requireWorkspaceViewer } from '@/lib/workspace/session';
import { WorkspaceShell } from '../_components/workspace-shell';
import { AssistantClient, type InitialConsultation } from './_components/assistant-client';

export const metadata: Metadata = { title: '员工服务助手 · 初见 ONBOARD' };

interface Props {
  searchParams: Promise<{ c?: string }>;
}

export default async function AssistantPage({ searchParams }: Props) {
  const viewer = await requireWorkspaceViewer();
  const { c } = await searchParams;

  const recentRows = await prisma.consultation.findMany({
    where: { userId: viewer.id },
    orderBy: { updatedAt: 'desc' },
    take: MAX_RECENT_CONSULTATIONS,
    select: { id: true, title: true },
  });

  let initial: InitialConsultation | null = null;
  if (c) {
    // 归属条件直接下推到查询里，查不到就当「新咨询」，不报错也不泄露存在性
    const row = await prisma.consultation.findFirst({
      where: { id: c, userId: viewer.id },
      select: {
        id: true,
        title: true,
        messages: {
          orderBy: { seq: 'asc' },
          select: { id: true, role: true, content: true, seq: true, createdAt: true },
        },
      },
    });
    if (row) {
      initial = {
        id: row.id,
        title: row.title,
        messages: row.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      };
    }
  }

  return (
    <WorkspaceShell
      name={viewer.name?.trim() || viewer.email || '未填写姓名'}
      department={viewer.department?.trim() || '未设置'}
      roleLabel={viewer.roleLabel}
      active="assistant"
      pageTitle="员工服务助手"
      canManage={canManageEmployees(viewer.role)}
      canConfigureModel={canConfigureModel(viewer.role)}
      recentConsultations={recentRows}
      activeConsultationId={initial?.id ?? ''}
    >
      <AssistantClient
        key={initial?.id ?? 'new'}
        name={viewer.name?.trim() || viewer.email || '同事'}
        initialConsultation={initial}
      />
    </WorkspaceShell>
  );
}
