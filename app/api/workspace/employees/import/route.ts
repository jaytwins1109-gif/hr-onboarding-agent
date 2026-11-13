// app/api/workspace/employees/import/route.ts
//
// 批量导入（文档第 5 步）：confirm=false 只做预览校验、绝不写库；
// confirm=true 才写入「通过」的行，错误行跳过并回报导入/跳过数量。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { canManageEmployees } from '@/lib/workspace/access';
import { getWorkspaceViewer } from '@/lib/workspace/session';
import { ensureDepartment } from '@/lib/workspace/departments';
import { ROLE_BY_LABEL, parseCsv, validateImportRows } from '@/lib/workspace/import';
import { accountFromEmployeeNo, DEMO_PASSWORD, newUserId } from '@/lib/workspace/employees';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageEmployees(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权导入员工' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    csv?: unknown;
    confirm?: unknown;
  } | null;
  const rows = parseCsv(String(body?.csv ?? ''));
  const confirm = body?.confirm === true;
  if (rows.length === 0) {
    return NextResponse.json({ error: '表格里没有可导入的数据行' }, { status: 400 });
  }

  const existing = await prisma.user.findMany({
    where: { employeeNo: { not: null } },
    select: { employeeNo: true },
  });
  const checked = validateImportRows(
    rows,
    existing.map((u) => u.employeeNo ?? ''),
    viewer.role,
  );

  if (!confirm) return NextResponse.json({ ok: true, checked });

  let imported = 0;
  let skipped = 0;
  for (const item of checked) {
    if (!item.ok) {
      skipped += 1;
      continue;
    }
    try {
      const dept = await ensureDepartment(item.row.department);
      await prisma.user.create({
        data: {
          id: newUserId(),
          email: accountFromEmployeeNo(item.row.employeeNo),
          password: await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS),
          name: item.row.name,
          employeeNo: item.row.employeeNo,
          department: dept,
          role: ROLE_BY_LABEL[item.row.role],
          isGuest: false,
          isActive: true,
        },
      });
      imported += 1;
    } catch {
      skipped += 1;
    }
  }
  return NextResponse.json({ ok: true, imported, skipped, checked });
}
