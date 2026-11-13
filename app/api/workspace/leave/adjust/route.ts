// app/api/workspace/leave/adjust/route.ts — 调整年假：只追加一条流水，绝不修改历史

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManageLeave } from '@/lib/workspace/access';
import { parseAdjustDays, parseLeaveYear, formatDays } from '@/lib/workspace/leave';
import { appendLeaveEntry, balanceFor } from '@/lib/workspace/leave-store';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canManageLeave(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权调整年假' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    year?: unknown;
    days?: unknown;
    reason?: unknown;
  } | null;
  const userId = String(body?.userId ?? '').trim();
  const year = parseLeaveYear(body?.year);
  if (!year.ok) return NextResponse.json({ error: year.error }, { status: 400 });
  const days = parseAdjustDays(body?.days);
  if (!days.ok) return NextResponse.json({ error: days.error }, { status: 400 });
  const reason = String(body?.reason ?? '').trim();
  if (!reason) return NextResponse.json({ error: '请填写调整原因' }, { status: 400 });
  if (reason.length > 100) {
    return NextResponse.json({ error: '调整原因不超过 100 个字' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isGuest: true },
  });
  if (!user || user.isGuest) {
    return NextResponse.json({ error: '找不到这个员工' }, { status: 404 });
  }

  const current = await balanceFor(userId, year.value);
  const next = Math.round((current + days.value) * 10) / 10;
  if (next < 0) {
    return NextResponse.json(
      { error: `调整后余额会变成 ${formatDays(next)} 天，不能为负数，请检查天数` },
      { status: 400 },
    );
  }

  await appendLeaveEntry({
    userId,
    year: year.value,
    delta: days.value,
    reason,
    kind: 'adjust',
    operatorId: viewer.id,
  });
  return NextResponse.json({ ok: true, balance: next });
}
