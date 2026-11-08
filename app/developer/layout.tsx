// app/developer/layout.tsx — 开发者后台独立布局：暗色侧边栏 + 主内容区
//
// 与 /admin 完全分离的守卫链：middleware（DEVELOPER 票）→ 这里 isDeveloperPageAuthed
// 再验签一次。未授权不渲染侧边栏，children 独占全屏（不露出导航结构）。
import type { ReactNode } from 'react';
import { DeveloperSidebar } from '@/components/developer/sidebar';
import { isDeveloperPageAuthed } from '@/lib/developer/page-auth';

export const metadata = {
  title: '开发者后台',
};

export default async function DeveloperLayout({ children }: { children: ReactNode }) {
  const authed = await isDeveloperPageAuthed();
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <div className="max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="text-lg font-semibold text-slate-100">无权访问</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            开发者后台仅对 DEVELOPER 角色开放。 若你刚被提权，请退出 C
            端重新登录以刷新票据里的角色快照。
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen bg-slate-950">
      <DeveloperSidebar />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
