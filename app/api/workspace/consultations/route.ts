// app/api/workspace/consultations/route.ts — 「最近咨询」列表与发送一条提问
//
// 红线：列表只查本人 userId；追加消息前先确认 consultationId 归本人，
// 别人的会话 id 一律 404（不泄露会话是否存在）。
// 本步的 assistant 回复固定占位，真正带依据的回答在后续步骤接入。

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  canReadConsultation,
  checkQuestion,
  consultationTitle,
  MAX_RECENT_CONSULTATIONS,
  PLACEHOLDER_REPLY,
} from '@/lib/workspace/consultations';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  seq: true,
  createdAt: true,
} as const;

function serialize(
  rows: { id: string; role: string; content: string; seq: number; createdAt: Date }[],
) {
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const rows = await prisma.consultation.findMany({
    where: { userId: viewer.id },
    orderBy: { updatedAt: 'desc' },
    take: MAX_RECENT_CONSULTATIONS,
    select: { id: true, title: true, updatedAt: true },
  });
  return NextResponse.json({
    ok: true,
    consultations: rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const check = checkQuestion(body?.message);
  const question = check.value;
  if (!check.ok || !question) {
    return NextResponse.json({ error: check.error ?? '请输入你的问题' }, { status: 400 });
  }

  const requestedId = typeof body?.consultationId === 'string' ? body.consultationId.trim() : '';
  let consultationId = requestedId;
  let title = '';

  if (requestedId) {
    const existing = await prisma.consultation.findUnique({
      where: { id: requestedId },
      select: { userId: true, title: true },
    });
    if (!existing || !canReadConsultation(viewer.id, existing.userId)) {
      return NextResponse.json({ error: '找不到这段咨询' }, { status: 404 });
    }
    title = existing.title;
  } else {
    consultationId = `c_${randomUUID()}`;
    title = consultationTitle(question);
  }

  try {
    const rows = await prisma.$transaction(async (tx) => {
      if (requestedId) {
        await tx.consultation.update({
          where: { id: consultationId },
          data: { updatedAt: new Date() },
        });
      } else {
        await tx.consultation.create({
          data: { id: consultationId, userId: viewer.id, title },
        });
      }
      const seq = await tx.consultationMessage.count({ where: { consultationId } });
      await tx.consultationMessage.create({
        data: { id: randomUUID(), consultationId, role: 'user', content: question, seq: seq + 1 },
      });
      await tx.consultationMessage.create({
        data: {
          id: randomUUID(),
          consultationId,
          role: 'assistant',
          content: PLACEHOLDER_REPLY,
          seq: seq + 2,
        },
      });
      return tx.consultationMessage.findMany({
        where: { consultationId },
        orderBy: { seq: 'asc' },
        select: MESSAGE_SELECT,
      });
    });
    return NextResponse.json(
      { ok: true, consultationId, title, messages: serialize(rows) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: '暂时没能保存这条消息，请稍后再试' }, { status: 500 });
  }
}
