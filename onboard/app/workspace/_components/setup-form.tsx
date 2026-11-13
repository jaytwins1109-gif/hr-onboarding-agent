'use client';

// 首启「创建你的工作空间」表单：只在系统还没有任何正式账号时出现。
// 创建成功后由服务端重渲染（router.refresh），票据已由接口签好 → 自动进入主界面。

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, account, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || '创建失败，请稍后再试');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError('连接不上服务，请确认网站已正常启动');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-blue-700">初见 ONBOARD</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">创建你的工作空间</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          先设置第一位管理员。创建后会自动登录，账号由公司管理员分配，不提供公开注册。
        </p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block text-sm font-medium text-slate-700">
            管理员姓名
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：李示例"
              maxLength={30}
              autoComplete="name"
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            登录账号
            <input
              className={INPUT}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请使用邮箱格式，例如 admin@example.com"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密码
            <input
              className={INPUT}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 10 位"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>

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
            {busy ? '正在创建…' : '创建并进入工作台'}
          </button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-slate-400">
          账号信息只保存在你自己的电脑上。示例内容仅用于演示，正式使用前请由管理员替换。
        </p>
      </div>
    </main>
  );
}
