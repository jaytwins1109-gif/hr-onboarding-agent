// app/api/workspace/departments/route.ts — 组织架构页「新增部门」（仅 HR 管理员 / 系统管理员）

import { NextRequest, NextResponse } from 'next/server';
import { canManageEmployees } from '@/lib/workspace/access';
import { getWorkspaceViewer } from '@/lib/workspace/session';
import { createDepartment } from '@/lib/workspace/departments';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权新增部门' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const result = await createDepartment(String(body?.name ?? ''));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.name ? '这个部门已经存在了' : '请填写部门名称' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, name: result.name });
}
