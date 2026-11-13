// app/api/workspace/leave/my/route.ts — 「我的年假」：服务端强制限定本人记录。
// 即使请求里夹带别人的 userId，普通员工也会被 canViewLeave 挡住（文档第 12 步红线）。

import { NextRequest, NextResponse } from 'next/server';
import { canViewLeave } from '@/lib/workspace/access';
import { listLeaveSummaries } from '@/lib/workspace/leave-store';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const requested = req.nextUrl.searchParams.get('userId')?.trim() || viewer.id;
  if (!canViewLeave(viewer, requested)) {
    return NextResponse.json({ error: '只能查询本人的年假记录' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, summaries: await listLeaveSummaries(requested) });
}
