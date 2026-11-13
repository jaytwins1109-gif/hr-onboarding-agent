'use client';

// 登录页：左品牌区 + 右登录卡片（员工登录 / 管理后台双标签）。
// 失败话术完全由服务端统一给出，前端不区分「账号错」还是「密码错」。
// 本步不做按角色自动分流（文档阶段 12），两个标签只切换输入文案。

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

type Mode = 'employee' | 'admin';

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('employee');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotHint, setForgotHint] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account, password, mode }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || '登录失败，请稍后再试');
        setBusy(false);
        return;
      }
      router.push('/workspace');
      router.refresh();
    } catch {
      setError('连接不上服务，请确认网站已正常启动');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-white">
      {/* 左半边：品牌区 */}
      <section className="hidden w-1/2 flex-col justify-between bg-slate-900 px-12 py-12 text-white lg:flex">
        <div>
          <p className="text-lg font-bold tracking-wide">初见 ONBOARD</p>
          <p className="mt-1 text-xs text-slate-400">员工服务中心</p>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-snug">从第一天起，让每个问题都有据可依。</h1>
          <p className="mt-5 text-sm leading-relaxed text-slate-300">
            公司的制度，你的假期，工作中的小疑问。一个属于员工的、值得信赖的服务入口。
          </p>
        </div>
        <p className="text-xs text-slate-500">示例内容仅用于演示，正式使用前请由管理员替换。</p>
      </section>

      {/* 右半边：登录卡片 */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-700 lg:hidden">
            初见 ONBOARD
          </p>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">欢迎回来</h2>
          <p className="mt-2 text-sm text-slate-600">登录后即可进入你的工作空间。</p>

          {/* 双标签 */}
          <div className="mt-7 flex rounded-lg bg-slate-100 p-1">
            {(['employee', 'admin'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError('');
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                  mode === item ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                {item === 'employee' ? '员工登录' : '管理后台'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-slate-700">
              {mode === 'employee' ? '员工编号 / 员工账号' : '管理账号'}
              <input
                className={INPUT}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={mode === 'employee' ? '请输入员工编号或登录账号' : '请输入管理账号'}
                autoComplete="username"
                required
              />
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                密码
                <input
                  className={INPUT}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="h-3.5 w-3.5 accent-blue-700"
                  />
                  显示密码
                </label>
                <button
                  type="button"
                  onClick={() => setForgotHint(true)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  忘记密码？
                </button>
              </div>
              {forgotHint && (
                <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  请联系公司 HR 或系统管理员重置密码
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {busy ? '正在登录…' : '登录'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            账号由公司管理员分配，无公开注册
          </p>
        </div>
      </section>
    </main>
  );
}
