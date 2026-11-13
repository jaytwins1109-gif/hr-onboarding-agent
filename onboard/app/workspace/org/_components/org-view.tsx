'use client';

// 组织架构目录：公司 → 部门 → 启用成员。管理员可新增部门、跳员工管理。
// 刻意不画汇报线、不显示职位——现有数据里没有这些信息。

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Users } from 'lucide-react';

export interface OrgGroup {
  name: string;
  members: { id: string; name: string }[];
}

export function OrgView({ groups, canManage }: { groups: OrgGroup[]; canManage: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function addDepartment() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/departments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || '新增失败，请稍后再试');
        return;
      }
      setName('');
      setAdding(false);
      router.refresh();
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  const total = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        当前展示的是虚构示例数据，仅用于演示。这里只呈现「部门—成员」目录，不代表汇报关系或职位。
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">示例公司 · 组织架构</h2>
          <p className="mt-1 text-xs text-slate-500">
            {groups.length} 个部门 · {total} 位启用成员
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
            >
              新增部门
            </button>
            <Link
              href="/workspace/employees"
              className="flex min-h-[40px] items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white"
            >
              去员工管理
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.name}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-700" />
              <h3 className="text-sm font-bold text-slate-900">{group.name}</h3>
              <span className="ml-auto text-xs text-slate-400">{group.members.length} 人</span>
            </div>
            {group.members.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {group.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {m.name.slice(0, 1)}
                    </span>
                    <span className="text-sm text-slate-700">{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                <Users className="h-3.5 w-3.5" />
                这个部门还没有启用成员
              </p>
            )}
          </section>
        ))}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">新增部门</h3>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入部门名称"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600"
            />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={addDepartment}
                disabled={busy}
                className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
