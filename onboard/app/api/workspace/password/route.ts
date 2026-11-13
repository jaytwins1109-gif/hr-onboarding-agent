// app/api/workspace/password/route.ts
//
// 工作台侧栏「修改密码」：服务端验当前登录票据 + 校验旧密码后更新 bcrypt 哈希。
// 密码不落日志、不回显；票据继续有效（role 快照不受改密影响）。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

export async function POST(req: NextRequest) {
  const ticket = await verifyUserToken(req.cookies.get(TOKEN_COOKIE)?.value);
  if (!ticket) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  const currentPassword = String(body?.currentPassword ?? '');
  const newPassword = String(body?.newPassword ?? '');

  if (newPassword.length < 10) {
    return NextResponse.json({ error: '新密码至少 10 位' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: ticket.userId } });
    if (!user || !user.password || user.isGuest || !user.isActive) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: '当前密码不对' }, { status: 401 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[workspace/password]', err);
    return NextResponse.json({ error: '修改密码失败，请稍后再试' }, { status: 500 });
  }
}
