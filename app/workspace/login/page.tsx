// app/workspace/login/page.tsx
//
// 工作台登录页（并行新增地址，不改动现有首页 / 的登录弹窗）。
// 服务端先行判定：已登录直接回工作台；系统还没有账号时引导去创建工作空间。

import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = {
  title: '登录 · 初见 ONBOARD',
};

export default async function LoginPage() {
  const ticket = await verifyUserToken((await cookies()).get(TOKEN_COOKIE)?.value);
  if (ticket) {
    const exists = await prisma.user.findUnique({ where: { id: ticket.userId } });
    if (exists) redirect('/workspace');
  }

  const accountCount = await prisma.user.count({ where: { isGuest: false } });
  if (accountCount === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-700">初见 ONBOARD</p>
          <h1 className="mt-3 text-xl font-bold text-slate-900">还没有工作空间</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            请先创建工作空间并设置第一位管理员，之后就可以用管理员分配的账号登录。
          </p>
          <Link
            href="/workspace"
            className="mt-6 flex min-h-[44px] items-center justify-center rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            去创建工作空间
          </Link>
        </div>
      </main>
    );
  }

  return <LoginForm />;
}
