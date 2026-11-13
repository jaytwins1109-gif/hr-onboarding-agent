// app/api/workspace/policies/route.ts — 制度知识库：列表（含后台解析兜底触发）与上传

import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManageEmployees } from '@/lib/workspace/access';
import { POLICY_CATEGORIES } from '@/lib/workspace/policies';
import { schedulePolicyProcessing } from '@/lib/workspace/policy-parser';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

const STORAGE_DIR = join(process.cwd(), 'data', 'policies');
const MAX_SIZE = 8 * 1024 * 1024;
const ACCEPTED = ['.pdf', '.docx', '.txt', '.md'];

function deny() {
  return NextResponse.json({ error: '当前账号无权管理制度知识库' }, { status: 403 });
}

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) return deny();
  // 页面轮询时兜底：进程重启后遗留的「排队中」文档也能被重新认领
  schedulePolicyProcessing();
  const docs = await prisma.policyDocument.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      category: true,
      scope: true,
      version: true,
      effectiveDate: true,
      status: true,
      failureReason: true,
      fileName: true,
      createdAt: true,
      publishedAt: true,
    },
  });
  return NextResponse.json({ ok: true, docs });
}

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) return deny();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: '上传内容格式不对' }, { status: 400 });
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const scope = String(form.get('scope') ?? 'all').trim();
  const version = String(form.get('version') ?? '').trim();
  const effectiveDate = String(form.get('effectiveDate') ?? '').trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '请选择要上传的制度文件' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '文件不能超过 8 MB' }, { status: 400 });
  }
  const ext = extname(file.name).toLowerCase();
  if (!ACCEPTED.includes(ext)) {
    return NextResponse.json(
      { error: '只支持 PDF、Word（.docx）和文本文件（.txt / .md）' },
      { status: 400 },
    );
  }
  if (!name || name.length > 80) {
    return NextResponse.json({ error: '请填写制度名称（不超过 80 个字）' }, { status: 400 });
  }
  if (!(POLICY_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: '请选择制度分类' }, { status: 400 });
  }
  if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return NextResponse.json({ error: '请填写版本号与生效日期' }, { status: 400 });
  }

  const id = `pol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await mkdir(STORAGE_DIR, { recursive: true });
  // 原始文件用内部 id 命名，避免文件名里的路径穿越，也不能靠猜文件名直接下载
  const filePath = join(STORAGE_DIR, `${id}${ext}`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  await prisma.policyDocument.create({
    data: {
      id,
      name,
      category,
      scope,
      version,
      effectiveDate,
      status: 'queued',
      fileName: file.name,
      filePath,
      mimeType: file.type || 'application/octet-stream',
      uploadedById: viewer.id,
    },
  });
  schedulePolicyProcessing();
  return NextResponse.json({ ok: true, id, status: 'queued' });
}
