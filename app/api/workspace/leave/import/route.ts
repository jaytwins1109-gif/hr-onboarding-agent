// app/api/workspace/leave/import/route.ts — 导入余额：预览校验 → 确认才写入。
// 与现有余额不一致时生成一条「对账调整」流水，不覆盖任何历史流水。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManageLeave } from '@/lib/workspace/access';
import {
  formatDays,
  parseLeaveCsv,
  reconcileDelta,
  validateLeaveImportRows,
} from '@/lib/workspace/leave';
import { appendLeaveEntry, balanceFor, hasEntries } from '@/lib/workspace/leave-store';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageLeave(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权导入年假余额' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    csv?: unknown;
    confirm?: unknown;
  } | null;
  const rows = parseLeaveCsv(String(body?.csv ?? ''));
  if (rows.length === 0) {
    return NextResponse.json({ error: '表格里没有可导入的数据行' }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { isGuest: false, employeeNo: { not: null } },
    select: { id: true, employeeNo: true, name: true },
  });
  // 确认阶段重新校验，不信任前端回传的 checked 结果
  const checked = validateLeaveImportRows(rows, users);
  if (body?.confirm !== true) return NextResponse.json({ ok: true, checked });

  let imported = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const item of checked) {
    if (!item.ok || !item.userId || item.year === null || item.days === null) {
      skipped += 1;
      continue;
    }
    const current = await balanceFor(item.userId, item.year);
    const recorded = await hasEntries(item.userId, item.year);
    const delta = reconcileDelta(current, item.days);
    if (delta === 0 && recorded) {
      unchanged += 1;
      continue;
    }
    const reason = recorded
      ? `导入对账：原余额 ${formatDays(current)} 天，导入 ${formatDays(item.days)} 天`
      : `导入对账：首次录入 ${formatDays(item.days)} 天`;
    await appendLeaveEntry({
      userId: item.userId,
      year: item.year,
      delta,
      reason,
      kind: 'reconcile',
      operatorId: viewer.id,
    });
    imported += 1;
  }
  return NextResponse.json({ ok: true, imported, unchanged, skipped, checked });
}
