'use client';

// 年假管理：余额表格 / 调整年假 / 导入余额（预览校验 → 确认写入）/ 流水明细。
// 所有写操作都走服务端接口二次校验；余额是流水合计，界面不提供任何「直接改余额」入口。

import { useState } from 'react';
import {
  formatDays,
  type CheckedLeaveRow,
  type LeaveEntry,
  type LeaveSummary,
} from '@/lib/workspace/leave';

interface EmployeeOption {
  id: string;
  label: string;
}

interface Props {
  initial: LeaveSummary[];
  employees: EmployeeOption[];
  currentYear: number;
}

type Modal = 'adjust' | 'import' | null;

const KIND_LABEL: Record<string, string> = {
  adjust: '手动调整',
  reconcile: '导入对账',
  grant: '额度发放',
  taken: '已休扣减',
  carry: '结转',
  demo: '示例数据',
};

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600';
const BTN = 'min-h-[40px] rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60';

export function LeaveAdmin({ initial, employees, currentYear }: Props) {
  const [rows, setRows] = useState<LeaveSummary[]>(initial);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ledger, setLedger] = useState<{ title: string; entries: LeaveEntry[] } | null>(null);
  const [form, setForm] = useState({
    userId: employees[0]?.id ?? '',
    year: String(currentYear),
    direction: 'add',
    amount: '1',
    reason: '',
  });
  const [csvText, setCsvText] = useState('');
  const [checked, setChecked] = useState<CheckedLeaveRow[]>([]);
  const [importResult, setImportResult] = useState('');

  async function reload() {
    const res = await fetch('/api/workspace/leave', { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as { summaries?: LeaveSummary[] } | null;
    if (res.ok && data?.summaries) setRows(data.summaries);
  }

  function openAdjust() {
    setForm({
      userId: employees[0]?.id ?? '',
      year: String(currentYear),
      direction: 'add',
      amount: '1',
      reason: '',
    });
    setError('');
    setNotice('');
    setModal('adjust');
  }

  function openImport() {
    setCsvText('');
    setChecked([]);
    setImportResult('');
    setError('');
    setNotice('');
    setModal('import');
  }

  async function submitAdjust() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/leave/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: form.userId,
          year: form.year,
          days: form.direction === 'add' ? form.amount : `-${form.amount}`,
          reason: form.reason,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        balance?: number;
      } | null;
      if (!res.ok) {
        setError(data?.error || '调整失败，请稍后再试');
        return;
      }
      await reload();
      setNotice(`调整已记录，当前余额 ${formatDays(data?.balance ?? 0)} 天`);
      setModal(null);
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setCsvText(await file.text());
    setChecked([]);
    setImportResult('');
  }

  async function runImport(confirm: boolean) {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/leave/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: csvText, confirm }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        checked?: CheckedLeaveRow[];
        imported?: number;
        unchanged?: number;
        skipped?: number;
      } | null;
      if (!res.ok) {
        setError(data?.error || '导入失败，请稍后再试');
        return;
      }
      setChecked(data?.checked ?? []);
      if (confirm) {
        setImportResult(
          `导入 ${data?.imported ?? 0} 行，跳过 ${data?.skipped ?? 0} 行；` +
            `${data?.unchanged ?? 0} 行余额一致，无需改动。`,
        );
        await reload();
      } else {
        const okCount = (data?.checked ?? []).filter((c) => c.ok).length;
        setImportResult(`预览完成：${okCount} 行通过校验，确认后才会写入。`);
      }
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  const passCount = checked.filter((c) => c.ok).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">年假余额台账</h2>
          <p className="mt-1 text-xs text-slate-500">余额等于全部流水的合计，历史变动始终保留。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openAdjust}
            className={`${BTN} bg-blue-700 text-white hover:bg-blue-800`}
          >
            调整年假
          </button>
          <button
            type="button"
            onClick={openImport}
            className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            导入余额
          </button>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}
      {error && !modal && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">员工</th>
              <th className="px-4 py-3 font-medium">年度</th>
              <th className="px-4 py-3 font-medium">剩余年假（天）</th>
              <th className="px-4 py-3 font-medium">最后更新时间</th>
              <th className="px-4 py-3 font-medium">变更记录</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={`${r.userId}-${r.year}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {r.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{r.name}</p>
                      <p className="truncate text-xs text-slate-400">{r.account || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.year}</td>
                <td className="px-4 py-3">
                  {r.balance === null ? (
                    <span className="text-slate-400">未录入</span>
                  ) : (
                    <span className="text-lg font-bold text-blue-700">{formatDays(r.balance)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.updatedAt || '—'}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setLedger({ title: `${r.name} · ${r.year} 年度流水`, entries: r.entries })
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

      <p className="text-xs leading-relaxed text-slate-500">
        余额由 HR 维护；导入余额会生成对账调整流水，历史变动始终保留。
      </p>

      {modal === 'adjust' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">调整年假</h3>
            <p className="mt-1 text-xs text-slate-500">
              每次调整都会新增一条流水，原流水不会被修改或删除。
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                员工
                <select
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className={INPUT}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                年度
                <input
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  inputMode="numeric"
                  className={INPUT}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  调整方向
                  <select
                    value={form.direction}
                    onChange={(e) => setForm({ ...form, direction: e.target.value })}
                    className={INPUT}
                  >
                    <option value="add">增加</option>
                    <option value="sub">减少</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  天数
                  <input
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="例如 1.5"
                    className={INPUT}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">支持 0.5 天粒度；调整后余额不能为负数。</p>
              <label className="block text-sm font-medium text-slate-700">
                调整原因（必填）
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="例如：示例：补发上年度结转"
                  className={INPUT}
                />
              </label>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className={`${BTN} flex-1 border border-slate-200 text-slate-600`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitAdjust}
                disabled={busy}
                className={`${BTN} flex-1 bg-blue-700 text-white hover:bg-blue-800`}
              >
                {busy ? '正在保存…' : '确认调整'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'import' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">导入余额</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              先预览校验，确认后才写入。与现有余额不一致时会生成一条「对账调整」流水，不直接覆盖。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="/api/workspace/leave/template"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                下载表格模板
              </a>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => void uploadFile(e.target.files?.[0])}
                className="text-sm text-slate-600"
              />
            </div>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setChecked([]);
                setImportResult('');
              }}
              rows={5}
              placeholder="员工编号,姓名,年度,剩余天数"
              className={`${INPUT} font-mono text-xs`}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runImport(false)}
                disabled={busy || !csvText.trim()}
                className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
              >
                预览校验
              </button>
              <button
                type="button"
                onClick={() => void runImport(true)}
                disabled={busy || checked.length === 0 || passCount === 0}
                className={`${BTN} bg-blue-700 text-white hover:bg-blue-800`}
              >
                {busy ? '正在处理…' : '确认导入'}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            {importResult && (
              <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {importResult}
              </p>
            )}
            {checked.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">行</th>
                      <th className="px-3 py-2 font-medium">员工编号</th>
                      <th className="px-3 py-2 font-medium">年度</th>
                      <th className="px-3 py-2 font-medium">剩余天数</th>
                      <th className="px-3 py-2 font-medium">结果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {checked.map((c) => (
                      <tr key={c.index}>
                        <td className="px-3 py-2 text-slate-500">{c.index + 1}</td>
                        <td className="px-3 py-2 text-slate-700">{c.row.employeeNo}</td>
                        <td className="px-3 py-2 text-slate-700">{c.row.year}</td>
                        <td className="px-3 py-2 text-slate-700">{c.row.days}</td>
                        <td className={`px-3 py-2 ${c.ok ? 'text-green-700' : 'text-red-700'}`}>
                          {c.ok ? '通过' : c.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              onClick={() => setModal(null)}
              className={`${BTN} mt-5 w-full border border-slate-200 text-slate-600`}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {ledger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{ledger.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              余额 = 以下所有流水的合计；每一笔都保留原因、增减天数与时间。
            </p>
            <div className="mt-4 space-y-2">
              {ledger.entries.map((e) => (
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
              {ledger.entries.length === 0 && (
                <p className="text-sm text-slate-500">还没有流水，请联系 HR 录入余额。</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLedger(null)}
              className={`${BTN} mt-5 w-full border border-slate-200 text-slate-600`}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
