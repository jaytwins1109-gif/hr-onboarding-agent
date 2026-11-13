// app/api/workspace/leave/template/route.ts — 年假余额导入模板（CSV，带 BOM 方便 Excel 打开中文）

import { NextResponse } from 'next/server';
import { canManageLeave } from '@/lib/workspace/access';
import { leaveTemplate } from '@/lib/workspace/leave';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageLeave(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权下载导入模板' }, { status: 403 });
  }
  return new NextResponse(`\uFEFF${leaveTemplate()}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="leave-balance-template.csv"',
    },
  });
}
