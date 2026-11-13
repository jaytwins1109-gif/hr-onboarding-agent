// components/developer/sidebar.tsx — 开发者后台侧边栏（client：导航高亮 + 返回前台）
//
// 与 admin 侧边栏刻意分离：只有底层配置入口（控制台 / Prompt 预览），
// 没有知识库/用户管理——那些是 ADMIN 的日常运维职责。
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, LayoutDashboard, Terminal, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/developer', label: '开发者控制台', icon: Gauge, exact: true },
  { href: '/developer/prompt', label: 'Prompt 预览', icon: Terminal },
] as const;

export function DeveloperSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-100">开发者后台</div>
          <div className="text-[11px] text-slate-500">Developer Console</div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const active =
            'exact' in rest && rest.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-violet-950/60 font-medium text-violet-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* 底部操作 */}
      <div className="space-y-1 border-t border-slate-800 px-3 py-4">
        {/* DEVELOPER 必有 /admin 全能力，横跳入口无需条件渲染 */}
        <Link
          href="/admin"
          className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          <LayoutDashboard className="h-4 w-4" />
          切换至管理后台
        </Link>
        <Link
          href="/"
          className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          <Undo2 className="h-4 w-4" />
          返回前台
        </Link>
      </div>
    </aside>
  );
}
