// app/admin/layout.tsx — B 端独立布局：左侧固定侧边栏 + 右侧主内容区
//
// 与 C 端完全分离：不用 cx 皮肤（那是聊天页的暖色体系），这里用 Tailwind 内置
// slate/sky 的浅色 SaaS 风格——admin 页面的样式改动不会波及 C 端。
// 未 authed（V1 口令表单场景）不渲染侧边栏，children 独占全屏。
// DEVELOPER 登录票额外解锁侧边栏的"切换至开发者后台"横跳入口。
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { AdminSidebar } from '@/components/admin/sidebar';
import { isAdminPageAuthed } from '@/lib/admin/page-auth';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';

export const metadata = {
  title: '小初管理后台',
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authed = await isAdminPageAuthed();
  if (!authed) {
    // 口令表单 / 未授权提示：全屏居中，不露出导航（导航点了也进不去，但没必要给看）
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">{children}</div>
    );
  }
  // 角色快照只在票里，读一次决定要不要给"切换至开发者后台"入口（口令票用户没有）
  const store = await cookies();
  const ticket = await verifyUserToken(store.get(TOKEN_COOKIE)?.value);
  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar canDeveloper={ticket?.role === 'DEVELOPER'} />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
