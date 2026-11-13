// app/api/workspace/login/route.ts
//
// 工作台登录页专用接口（并行新增，不改现有 /api/auth/login）。
// 支持「员工编号 / 员工账号」两种标识：账号走 email，编号走 employeeNo。
//
// 安全红线（文档第 2 步）：账号不存在、密码错、游客行、空输入一律回同一句中文，
// 绝不透露是「账号错」还是「密码错」，也不给账号枚举接口。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import {
  TOKEN_COOKIE,
  TOKEN_MAX_AGE,
  cookieString,
  normalizeRole,
  signUserToken,
} from '@/lib/auth/jwt';
import { canEnterAdminConsole } from '@/lib/workspace/access';

export const runtime = 'nodejs';

const FAIL_MESSAGE = '账号或密码不对，请检查后重试';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    account?: unknown;
    password?: unknown;
    mode?: unknown;
  } | null;

  const account = String(body?.account ?? '').trim();
  const password = String(body?.password ?? '');
  // mode 仅作前端标签记录，不参与本步的鉴权判断（按角色自动分流属于文档阶段 12）
  const mode = body?.mode === 'admin' ? 'admin' : 'employee';

  const fail = () => NextResponse.json({ error: FAIL_MESSAGE }, { status: 401 });
  if (!account || !password) return fail();

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account.toLowerCase() }, { employeeNo: account }],
      },
    });
    // 停用账号与游客行一律同一句失败话术：不向未持有凭证的人泄露账号状态
    if (!user || !user.password || user.isGuest || !user.isActive) return fail();
    if (!(await bcrypt.compare(password, user.password))) return fail();

    // 「管理后台」标签的角色闸门放在服务端：员工即使账号密码正确也不能走这个入口
    if (mode === 'admin' && !canEnterAdminConsole(user.role)) {
      return NextResponse.json(
        { error: '当前账号无权进入管理后台，请使用「员工登录」' },
        { status: 403 },
      );
    }

    const token = await signUserToken(user.id, normalizeRole(user.role));
    const res = NextResponse.json({ ok: true, mode });
    res.headers.append('Set-Cookie', cookieString(TOKEN_COOKIE, token, TOKEN_MAX_AGE));
    return res;
  } catch (err) {
    console.error('[workspace/login]', err);
    return NextResponse.json({ error: '登录服务出了点问题，请稍后再试' }, { status: 500 });
  }
}
