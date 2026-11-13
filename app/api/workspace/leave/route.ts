// app/api/workspace/leave/route.ts — 年假管理列表（仅 HR 管理员 / 系统管理员）

import { NextResponse } from 'next/server';
import { canManageLeave } from '@/lib/workspace/access';
import { listLeaveSummaries } from '@/lib/workspace/leave-store';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageLeave(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权进入年假管理' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, summaries: await listLeaveSummaries() });
}
