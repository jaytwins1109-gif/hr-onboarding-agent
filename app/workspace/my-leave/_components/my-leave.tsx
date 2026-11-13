'use client';

// 我的年假：表格 + 流水明细 + 空状态。
// 数据由服务端按当前账号查好传入；刷新也只请求 /leave/my，该接口再次强制本人范围。

import { useState } from 'react';
import { formatDays, type LeaveEntry, type LeaveSummary } from '@/lib/workspace/leave';

interface Props {
  initial: LeaveSummary[];
}

const KIND_LABEL: Record<string, string> = {
  adjust: '手动调整',
  reconcile: '导入对账',
  grant: '额度发放',
  taken: '已休扣减',
  carry: '结转',
  demo: '示例数据',
};

export function MyLeave({ initial }: Props) {
  const [rows, setRows] = useState<LeaveSummary[]>(initial);
  const [entries, setEntries] = useState<{ title: string; entries: LeaveEntry[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function reload() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workspace/leave/my', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as {
        summaries?: LeaveSummary[];
        error?: string;
      } | null;
      if (!res.ok || !data?.summaries) {
        setError(data?.error || '刷新失败，请稍后再试');
        return;
      }
      setRows(data.summaries);
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  const hasAnyRecord = rows.some((r) => r.balance !== null);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-slate-900 px-6 py-7 text-white">
        <h2 className="text-xl font-bold">我的年假</h2>
        <p className="mt-2 text-sm text-slate-300">
          这里只展示你本人的余额与每一笔变动，别人看不到你的记录。
        </p>
      </section>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={reload}
          disabled={busy}
          className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? '正在刷新…' : '刷新余额'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!hasAnyRecord ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">
            请联系 HR 录入你的年假数据；没有记录不代表余额为零
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            HR 录入后，这里会显示各年度余额与每一笔变动流水。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">年度</th>
                <th className="px-4 py-3 font-medium">剩余年假（天）</th>
                <th className="px-4 py-3 font-medium">最后更新时间</th>
                <th className="px-4 py-3 font-medium">变更记录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.userId}-${r.year}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.year}</td>
                  <td className="px-4 py-3">
                    {r.balance === null ? (
                      <span className="text-slate-400">未录入</span>
                    ) : (
                      <span className="text-lg font-bold text-blue-700">
                        {formatDays(r.balance)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.updatedAt || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setEntries({ title: `${r.year} 年度变动流水`, entries: r.entries })
                      }
                      className="min-h-[32px] rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      查看 {r.entries.length} 条流水
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">余额由 HR 维护。</p>

      {entries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{entries.title}</h3>
            <p className="mt-1 text-xs text-slate-500">历史变动始终保留，不会删除或覆盖。</p>
            <div className="mt-4 space-y-2">
              {entries.entries.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-slate-800">{e.reason}</p>
                    <span
                      className={`shrink-0 text-sm font-bold ${e.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {e.delta > 0 ? '+' : ''}
                      {formatDays(e.delta)} 天
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {e.createdAt} · {KIND_LABEL[e.kind] || e.kind}
                  </p>
                </div>
              ))}
              {entries.entries.length === 0 && (
                <p className="text-sm text-slate-500">这一年还没有流水。</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEntries(null)}
              className="mt-5 min-h-[40px] w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
