// app/api/workspace/policies/[id]/route.ts — 详情预览（列表/详情/下载共用可见性规则）与发布/下架/重试

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManageEmployees } from '@/lib/workspace/access';
import { canViewPolicy } from '@/lib/workspace/policies';
import { schedulePolicyProcessing } from '@/lib/workspace/policy-parser';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.policyDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: '找不到这份制度' }, { status: 404 });
  // 管理员可看全部状态；员工只能看「已发布 + 在有效期 + 适用本人部门」的正文
  if (!canManageEmployees(viewer.role) && !canViewPolicy(doc, viewer.department)) {
    return NextResponse.json({ error: '当前账号无权查看这份制度' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    doc: {
      id: doc.id,
      name: doc.name,
      category: doc.category,
      scope: doc.scope,
      version: doc.version,
      effectiveDate: doc.effectiveDate,
      status: doc.status,
      failureReason: doc.failureReason,
      content: doc.content,
      fileName: doc.fileName,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权操作制度' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = String(body?.action ?? '');
  const doc = await prisma.policyDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: '找不到这份制度' }, { status: 404 });

  if (action === 'publish') {
    if (doc.status !== 'pending') {
      return NextResponse.json({ error: '只有「待发布」的制度可以发布' }, { status: 400 });
    }
    await prisma.policyDocument.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), archivedAt: null },
    });
  } else if (action === 'archive') {
    if (doc.status !== 'published') {
      return NextResponse.json({ error: '只有「已发布」的制度可以下架' }, { status: 400 });
    }
    await prisma.policyDocument.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
  } else if (action === 'retry') {
    if (doc.status !== 'failed') {
      return NextResponse.json({ error: '只有解析失败的制度需要重试' }, { status: 400 });
    }
    await prisma.policyDocument.update({
      where: { id },
      data: { status: 'queued', failureReason: null },
    });
    schedulePolicyProcessing();
  } else {
    return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
