// app/api/workspace/setup/route.ts
//
// 「创建你的工作空间」：只在系统里还没有任何正式账号时允许创建第一个管理员。
// 这是叠加在现有登录体系之上的首启流程，不改动游客态与公开注册（拍板：先搁置）。
// 创建成功即签发现有 cx_token 票据自动登录；角色按映射约定给 DEVELOPER（系统管理员）。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { TOKEN_COOKIE, TOKEN_MAX_AGE, cookieString, signUserToken } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BCRYPT_ROUNDS = 10;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    account?: unknown;
    password?: unknown;
  } | null;

  const name = String(body?.name ?? '').trim();
  // 账号沿用现有 email 列：要求邮箱格式，才能与现有 /api/auth/login 无缝互通
  const account = String(body?.account ?? '')
    .trim()
    .toLowerCase();
  const password = String(body?.password ?? '');

  if (!name || name.length > 30) {
    return NextResponse.json({ error: '请填写管理员姓名（不超过 30 个字）' }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(account)) {
    return NextResponse.json({ error: '账号请使用邮箱格式，方便以后登录' }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: '密码至少 10 位' }, { status: 400 });
  }

  try {
    // 闸门放在服务端：只认「正式账号数 = 0」，游客空壳行不算账号
    const existing = await prisma.user.count({ where: { isGuest: false } });
    if (existing > 0) {
      return NextResponse.json({ error: '工作空间已创建，请登录后使用' }, { status: 403 });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        email: account,
        password: hashed,
        name,
        isGuest: false,
        role: 'DEVELOPER',
      },
    });

    const token = await signUserToken(user.id, 'DEVELOPER');
    const res = NextResponse.json({ ok: true, userId: user.id });
    res.headers.append('Set-Cookie', cookieString(TOKEN_COOKIE, token, TOKEN_MAX_AGE));
    return res;
  } catch (err) {
    console.error('[workspace/setup]', err);
    return NextResponse.json({ error: '创建工作空间失败，请稍后再试' }, { status: 500 });
  }
}
