// app/workspace/page.tsx
//
// 并行新增的工作台入口（/workspace）：不改动现有 /、/admin、/developer 任何一个页面。
// 身份判定全部在服务端完成：验票据 → 查库确认账号仍存在 → 才渲染主界面。
// 三种状态：已登录 → 主界面骨架；空库未登录 → 创建工作空间；已有账号未登录 → 引导到 /workspace/login。

import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';
import {
  canAccessWorkspace,
  canConfigureModel,
  canManageEmployees,
  workspaceRoleLabel,
} from '@/lib/workspace/access';
import { SetupForm } from './_components/setup-form';
import { WorkspaceShell } from './_components/workspace-shell';

export const metadata: Metadata = {
  title: '初见 ONBOARD · 工作空间',
};

export default async function WorkspacePage() {
  const store = await cookies();
  const ticket = await verifyUserToken(store.get(TOKEN_COOKIE)?.value);

  let user: {
    name: string | null;
    email: string | null;
    department: string | null;
    role: string;
    isActive: boolean;
    isGuest: boolean;
  } | null = null;
  if (ticket) {
    user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: {
        name: true,
        email: true,
        department: true,
        role: true,
        isActive: true,
        isGuest: true,
      },
    });
  }

  if (ticket && user) {
    // 服务端闸门：停用/游客账号即使拿着有效票据、直接敲地址，也进不了主界面
    if (!canAccessWorkspace(user)) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-blue-700">初见 ONBOARD</p>
            <h1 className="mt-3 text-xl font-bold text-slate-900">当前账号无权进入工作台</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              账号可能已停用，请联系公司 HR 或系统管理员确认。
            </p>
            <Link
              href="/"
              className="mt-6 flex min-h-[44px] items-center justify-center rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              返回首页
            </Link>
          </div>
        </main>
      );
    }
    return (
      <WorkspaceShell
        name={user.name?.trim() || user.email || '未填写姓名'}
        department={user.department?.trim() || '未设置'}
        roleLabel={workspaceRoleLabel(user.role)}
        canManage={canManageEmployees(user.role)}
        canConfigureModel={canConfigureModel(user.role)}
      />
    );
  }

  const accountCount = await prisma.user.count({ where: { isGuest: false } });
  if (accountCount === 0) return <SetupForm />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-blue-700">初见 ONBOARD</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">请先登录</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          这个工作空间已经创建好了。请用管理员分配的账号登录，登录后会回到这里。
        </p>
        <Link
          href="/workspace/login"
          className="mt-6 flex min-h-[44px] items-center justify-center rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          前往登录
        </Link>
      </div>
    </main>
  );
}
