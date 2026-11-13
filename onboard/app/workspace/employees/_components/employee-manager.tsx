'use client';

// 员工管理表格：新增 / 编辑（含停用与重置密码）/ 批量导入（预览校验 → 确认写入）。
// 所有写操作都经过服务端接口二次校验；刷新用 router.refresh 让服务端重新查库。

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CheckedRow } from '@/lib/workspace/import';

const ROLE_LABEL: Record<string, string> = {
  USER: '员工',
  ADMIN: 'HR 管理员',
  PRODUCT_OPS: '产品运营',
  DEVELOPER: '系统管理员',
};

export interface EmployeeRow {
  id: string;
  name: string;
  account: string | null;
  employeeNo: string | null;
  department: string | null;
  role: string;
  isActive: boolean;
}

interface Props {
  initial: EmployeeRow[];
  departments: string[];
  roles: { code: string; label: string }[];
}

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600';
const BTN = 'min-h-[40px] rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60';

export function EmployeeManager({ initial, departments, roles }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<'create' | 'edit' | 'import' | null>(null);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    employeeNo: '',
    department: '',
    role: 'USER',
    password: '',
    isActive: true,
  });
  const [csvText, setCsvText] = useState('');
  const [checked, setChecked] = useState<CheckedRow[]>([]);
  const [importResult, setImportResult] = useState('');

  function openCreate() {
    setForm({
      name: '',
      employeeNo: '',
      department: departments[0] ?? '',
      role: roles[0]?.code ?? 'USER',
      password: '',
      isActive: true,
    });
    setError('');
    setModal('create');
  }

  function openEdit(row: EmployeeRow) {
    setEditing(row);
    setForm({
      name: row.name,
      employeeNo: row.employeeNo ?? '',
      department: row.department ?? '',
      role: row.role,
      password: '',
      isActive: row.isActive,
    });
    setError('');
    setModal('edit');
  }

  async function save() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const payload =
        modal === 'create'
          ? { ...form }
          : {
              id: editing?.id,
              name: form.name,
              department: form.department,
              isActive: form.isActive,
              password: form.password,
            };
      const res = await fetch('/api/workspace/employees', {
        method: modal === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || '保存失败，请稍后再试');
        return;
      }
      setModal(null);
      router.refresh();
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
    setError('');
  }

  async function runImport(confirm: boolean) {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/employees/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: csvText, confirm }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        checked?: CheckedRow[];
        imported?: number;
        skipped?: number;
      } | null;
      if (!res.ok) {
        setError(data?.error || '导入失败，请稍后再试');
        return;
      }
      setChecked(data?.checked ?? []);
      if (confirm) {
        setImportResult(`导入了 ${data?.imported ?? 0} 行，跳过了 ${data?.skipped ?? 0} 行`);
        router.refresh();
      }
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        当前展示的是虚构示例数据，仅用于演示；正式使用前请由管理员替换并重置所有初始密码。
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">员工列表</h2>
          <p className="mt-1 text-xs text-slate-500">共 {initial.length} 个账号</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/workspace/employees/template"
            className={`${BTN} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          >
            下载导入模板
          </a>
          <button
            type="button"
            onClick={() => {
              setCsvText('');
              setChecked([]);
              setImportResult('');
              setError('');
              setModal('import');
            }}
            className={`${BTN} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          >
            批量导入
          </button>
          <button
            type="button"
            onClick={openCreate}
            className={`${BTN} bg-blue-700 text-white hover:bg-blue-800`}
          >
            新增员工
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {['员工', '员工编号', '部门', '角色', '状态', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initial.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {row.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="font-medium text-slate-800">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.account ?? '未设置账号'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.employeeNo ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.department ?? '未设置'}</td>
                <td className="px-4 py-3 text-slate-600">{ROLE_LABEL[row.role] ?? '员工'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      row.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.isActive ? '启用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="text-sm text-blue-700 hover:underline"
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
            {initial.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  还没有员工账号，点右上角「新增员工」开始。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新增 / 编辑弹窗 */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {modal === 'create' ? '新增员工' : '编辑员工'}
            </h3>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                姓名
                <input
                  className={INPUT}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="虚构的中文姓名"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                员工编号
                <input
                  className={`${INPUT} ${modal === 'edit' ? 'bg-slate-100' : ''}`}
                  value={form.employeeNo}
                  readOnly={modal === 'edit'}
                  onChange={(e) => setForm({ ...form, employeeNo: e.target.value })}
                  placeholder="例如 CX-0001"
                />
                {modal === 'edit' && (
                  <span className="mt-1 block text-xs text-slate-400">员工编号建好后不能修改</span>
                )}
              </label>
              <label className="block text-sm font-medium text-slate-700">
                部门
                <input
                  className={INPUT}
                  list="department-options"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="可从已有部门选择，也可直接输入新部门"
                />
                <datalist id="department-options">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>
              {modal === 'create' ? (
                <label className="block text-sm font-medium text-slate-700">
                  角色
                  <select
                    className={INPUT}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4 accent-blue-700"
                  />
                  账号启用（取消勾选即停用，停用后不能登录）
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                {modal === 'create' ? '初始密码' : '重置密码'}
                <input
                  type="password"
                  className={INPUT}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={modal === 'create' ? '至少 10 位' : '留空表示不修改'}
                />
              </label>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? '正在保存…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量导入弹窗 */}
      {modal === 'import' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">批量导入 · 预览与校验</h3>
            <p className="mt-1 text-xs text-slate-500">
              先上传表格查看逐行结果，确认后才会真正写入；有问题的行不会导入。
            </p>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => uploadFile(e.target.files?.[0])}
              className="mt-4 w-full text-sm text-slate-600"
            />
            <button
              type="button"
              onClick={() => runImport(false)}
              disabled={!csvText || busy}
              className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
            >
              预览与校验
            </button>

            {checked.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {['行号', '姓名', '员工编号', '部门', '角色', '结果'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {checked.map((c) => (
                      <tr key={c.index}>
                        <td className="px-3 py-2">{c.index + 1}</td>
                        <td className="px-3 py-2">{c.row.name || '—'}</td>
                        <td className="px-3 py-2">{c.row.employeeNo || '—'}</td>
                        <td className="px-3 py-2">{c.row.department || '—'}</td>
                        <td className="px-3 py-2">{c.row.role || '—'}</td>
                        <td className={`px-3 py-2 ${c.ok ? 'text-green-700' : 'text-red-700'}`}>
                          {c.ok ? '通过' : c.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            {importResult && (
              <p className="mt-3 text-sm font-medium text-green-700">{importResult}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => runImport(true)}
                disabled={checked.length === 0 || checked.every((c) => !c.ok) || busy}
                className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
