// app/api/workspace/policies/[id]/file/route.ts — 原始文件下载
//
// 必须登录且有权限：管理员可下载任意状态做审核；员工只能下载「对自己可见」的制度。
// 文件路径只存在服务端，URL 里只有内部 id，猜地址也拿不到未授权文件。

import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManageEmployees } from '@/lib/workspace/access';
import { canViewPolicy } from '@/lib/workspace/policies';
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
  if (!canManageEmployees(viewer.role) && !canViewPolicy(doc, viewer.department)) {
    return NextResponse.json({ error: '当前账号无权下载这份制度' }, { status: 403 });
  }
  try {
    const data = await readFile(doc.filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'content-type': doc.mimeType || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: '原始文件已丢失，请重新上传' }, { status: 404 });
  }
}
