// app/api/workspace/employees/template/route.ts — 批量导入模板下载（CSV，带 BOM 方便 Excel 打开中文）

import { NextResponse } from 'next/server';
import { canManageEmployees } from '@/lib/workspace/access';
import { getWorkspaceViewer } from '@/lib/workspace/session';
import { csvTemplate } from '@/lib/workspace/import';

export const runtime = 'nodejs';

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权下载导入模板' }, { status: 403 });
  }
  return new NextResponse(`\uFEFF${csvTemplate()}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="employees-template.csv"',
    },
  });
}
