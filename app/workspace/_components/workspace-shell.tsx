'use client';

// 工作台主界面骨架：左侧导航（品牌 / 菜单 / 底部用户）、顶部标题栏、中间内容区。
// 内容区由各页面以 children 传入；未传时保持第一步的「工作概览」欢迎卡片。
// 配色以深蓝色为主，且只作用于 /workspace，不影响现有 C 端暖色皮肤。
// 菜单是否显示由服务端算好的 canManage 决定（权限判断本身不在浏览器做）。

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Cpu,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Network,
  Users,
} from 'lucide-react';

type ActivePage =
  | 'home'
  | 'employees'
  | 'org'
  | 'policies'
  | 'policy-center'
  | 'leave'
  | 'my-leave'
  | 'model-config';

interface Props {
  name: string;
  department: string;
  roleLabel: string;
  active?: ActivePage;
  pageTitle?: string;
  canManage?: boolean;
  canConfigureModel?: boolean;
  children?: ReactNode;
}

const NAV: {
  key: ActivePage;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  manageOnly?: boolean;
  devOnly?: boolean;
}[] = [
  { key: 'home', href: '/workspace', label: '工作概览', icon: LayoutDashboard },
  { key: 'policy-center', href: '/workspace/policy-center', label: '制度中心', icon: BookOpen },
  { key: 'org', href: '/workspace/org', label: '组织架构', icon: Network },
  {
    key: 'my-leave',
    href: '/workspace/my-leave',
    label: '我的年假',
    icon: CalendarDays,
  },
  {
    key: 'employees',
    href: '/workspace/employees',
    label: '员工管理',
    icon: Users,
    manageOnly: true,
  },
  {
    key: 'leave',
    href: '/workspace/leave',
    label: '年假管理',
    icon: ClipboardList,
    manageOnly: true,
  },
  {
    key: 'policies',
    href: '/workspace/policies',
    label: '制度知识库',
    icon: FileText,
    manageOnly: true,
  },
  {
    key: 'model-config',
    href: '/workspace/model-config',
    label: '模型配置',
    icon: Cpu,
    devOnly: true,
  },
];

export function WorkspaceShell({
  name,
  department,
  roleLabel,
  active = 'home',
  pageTitle = '工作概览',
  canManage = false,
  canConfigureModel = false,
  children,
}: Props) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    setFormOk('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFormError(data?.error || '修改失败，请稍后再试');
      } else {
        setFormOk('密码已修改，请记住新密码');
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch {
      setFormError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-100 md:flex">
        <div className="px-6 py-6">
          <p className="text-lg font-bold tracking-wide">初见 ONBOARD</p>
          <p className="mt-1 text-xs text-slate-400">员工服务中心</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter(
            (item) => (!item.manageOnly || canManage) && (!item.devOnly || canConfigureModel),
          ).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active === item.key
                    ? 'bg-blue-700/30 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
              {name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-slate-400">{department}</p>
              <p className="truncate text-xs text-blue-300">{roleLabel}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPassword(true);
                setFormError('');
                setFormOk('');
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-slate-800 px-2 py-2 text-xs text-slate-200 transition hover:bg-slate-700"
            >
              <KeyRound className="h-3.5 w-3.5" />
              修改密码
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-slate-800 px-2 py-2 text-xs text-slate-200 transition hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-800 md:hidden">初见 ONBOARD</span>
            <h1 className="text-base font-bold text-slate-900">{pageTitle}</h1>
          </div>
          <span className="text-sm text-slate-500">{name}</span>
        </header>

        <main className="flex-1 p-6">
          {children ?? (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Building2 className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-slate-900">欢迎使用初见 ONBOARD</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {name}，欢迎回来。这里是你的工作概览，更多功能会按步骤逐步加入。
              </p>
            </section>
          )}
        </main>
      </div>

      {showPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">修改密码</h2>
            <p className="mt-1 text-xs text-slate-500">新密码至少 10 位，修改后不会退出登录。</p>
            <form onSubmit={changePassword} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                当前密码
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                新密码
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={10}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600"
                  required
                />
              </label>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              {formOk && <p className="text-sm text-green-700">{formOk}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
                >
                  关闭
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? '正在保存…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
