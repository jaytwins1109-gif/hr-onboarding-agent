// app/api/workspace/consultations/[id]/route.ts — 恢复整段对话
//
// 红线：对话记录只属于提问的员工本人；不是本人就 404，不返回任何内容片段。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canReadConsultation } from '@/lib/workspace/consultations';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const { id } = await params;

  const row = await prisma.consultation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      updatedAt: true,
      messages: {
        orderBy: { seq: 'asc' },
        select: { id: true, role: true, content: true, seq: true, createdAt: true },
      },
    },
  });
  if (!row || !canReadConsultation(viewer.id, row.userId)) {
    return NextResponse.json({ error: '找不到这段咨询' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    consultation: {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
    },
  });
}
