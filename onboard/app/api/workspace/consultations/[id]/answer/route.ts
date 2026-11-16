// app/api/workspace/consultations/[id]/answer/route.ts — 第 17 段异步回答任务
//
// POST 触发（立即返回 202，后台跑生成）；GET 轮询状态与回答快照。
// 红线：两出口都先校验会话归属，别人的 id 一律 404；GET 额外按 userId 过滤，
// 即使库里出现脏数据也不会把别人的回答带出来。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startAnswerJob } from '@/lib/workspace/answer-service';
import { canReadConsultation } from '@/lib/workspace/consultations';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parsePayload(json: string): unknown | null {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function ownedConsultation(id: string) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) {
    return { error: NextResponse.json({ error: '请先登录' }, { status: 401 }) };
  }
  const consultation = await prisma.consultation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!consultation || !canReadConsultation(viewer.id, consultation.userId)) {
    return { error: NextResponse.json({ error: '找不到这段咨询' }, { status: 404 }) };
  }
  return { viewer, consultation };
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const owned = await ownedConsultation(id);
  if ('error' in owned) return owned.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const requested = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
  const message = requested
    ? await prisma.consultationMessage.findFirst({
        where: { id: requested, consultationId: id },
        select: { id: true, role: true, content: true },
      })
    : await prisma.consultationMessage.findFirst({
        where: { consultationId: id, role: 'user' },
        orderBy: { seq: 'desc' },
        select: { id: true, role: true, content: true },
      });
  if (!message || message.role !== 'user') {
    return NextResponse.json({ error: '找不到要回答的问题' }, { status: 400 });
  }

  try {
    const job = await startAnswerJob({
      consultationId: id,
      messageId: message.id,
      userId: owned.viewer.id,
      question: message.content,
      department: owned.viewer.department,
    });
    if (job.reused) {
      const row = await prisma.consultationAnswer.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      return NextResponse.json({
        ok: true,
        answerId: job.id,
        messageId: message.id,
        status: row?.status ?? 'pending',
      });
    }
    return NextResponse.json(
      { ok: true, answerId: job.id, messageId: message.id, status: 'pending' },
      { status: 202 },
    );
  } catch {
    return NextResponse.json({ error: '没能启动回答生成，请稍后再试' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const owned = await ownedConsultation(id);
  if ('error' in owned) return owned.error;

  const messageId = new URL(req.url).searchParams.get('messageId')?.trim() || '';
  const rows = await prisma.consultationAnswer.findMany({
    where: {
      consultationId: id,
      userId: owned.viewer.id,
      ...(messageId ? { messageId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: {
      id: true,
      messageId: true,
      status: true,
      answerStatus: true,
      payloadJson: true,
      model: true,
      elapsedMs: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    answers: rows.map((row) => ({
      id: row.id,
      messageId: row.messageId,
      status: row.status,
      answerStatus: row.answerStatus,
      payload: row.status === 'done' ? parsePayload(row.payloadJson) : null,
      model: row.model,
      elapsedMs: row.elapsedMs,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
