'use client';

// 制度知识库：上传 → 后台解析（页面每 3 秒自动刷新状态）→ 预览正文 → 发布/下架/重试/下载。
// 所有状态变更都发生在服务端接口，前端只负责展示与触发。

import { useCallback, useEffect, useState } from 'react';
import { POLICY_CATEGORIES, POLICY_STATUS_LABEL, scopeLabel } from '@/lib/workspace/policies';

interface PolicyRow {
  id: string;
  name: string;
  category: string;
  scope: string;
  version: string;
  effectiveDate: string;
  status: string;
  failureReason: string | null;
  fileName: string;
  createdAt: string;
}

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'pending', label: '待发布' },
  { key: 'failed', label: '失败' },
  { key: 'archived', label: '已下架' },
];

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600';

export function PolicyLibrary({ departments }: { departments: string[] }) {
  const [docs, setDocs] = useState<PolicyRow[]>([]);
  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState('');
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    category: string;
    scope: string;
    version: string;
    effectiveDate: string;
  }>({
    name: '',
    category: POLICY_CATEGORIES[0],
    scope: 'all',
    version: 'v1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/policies', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { docs?: PolicyRow[] } | null;
      if (res.ok && data?.docs) setDocs(data.docs);
    } catch {
      // 轮询失败不打断页面，下一次会自动重试
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function upload() {
    if (busy) return;
    setError('');
    if (!file) {
      setError('请选择要上传的文件');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', form.name);
      fd.append('category', form.category);
      fd.append('scope', form.scope);
      fd.append('version', form.version);
      fd.append('effectiveDate', form.effectiveDate);
      const res = await fetch('/api/workspace/policies', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || '上传失败，请稍后再试');
        return;
      }
      setUploadOpen(false);
      setFile(null);
      setForm({ ...form, name: '' });
      await refresh();
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'publish' | 'archive' | 'retry') {
    setError('');
    const res = await fetch(`/api/workspace/policies/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) setError(data?.error || '操作失败，请稍后再试');
    await refresh();
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/workspace/policies/${id}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as {
      doc?: { name: string; content: string };
      error?: string;
    } | null;
    if (!res.ok || !data?.doc) {
      setError(data?.error || '读取正文失败');
      return;
    }
    setDetail(data.doc);
  }

  const filtered = docs.filter((d) => {
    if (tab !== 'all' && d.status !== tab) return false;
    if (category && d.category !== category) return false;
    if (scope && d.scope !== scope) return false;
    if (query.trim() && !d.name.includes(query.trim())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">制度知识库</h2>
          <p className="mt-1 text-xs text-slate-500">
            共 {docs.length} 份 · 上传后由后台解析，状态每 3 秒自动刷新
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError('');
            setUploadOpen(true);
          }}
          className="min-h-[40px] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
        >
          上传制度
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? 'bg-blue-700 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部分类</option>
          {POLICY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部适用范围</option>
          <option value="all">全员</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按制度名称搜索"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {['制度名称', '分类', '适用范围', '版本 / 生效日期', '状态', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-400">{d.fileName}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{d.category}</td>
                <td className="px-4 py-3 text-slate-600">{scopeLabel(d.scope)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {d.version}
                  <span className="ml-2 text-xs text-slate-400">{d.effectiveDate}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      d.status === 'published'
                        ? 'bg-green-50 text-green-700'
                        : d.status === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {POLICY_STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  {d.failureReason && (
                    <p className="mt-1 max-w-[220px] text-xs text-red-600">{d.failureReason}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => openDetail(d.id)}
                      className="text-blue-700 hover:underline"
                    >
                      查看详情
                    </button>
                    {d.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => act(d.id, 'publish')}
                        className="text-green-700 hover:underline"
                      >
                        发布
                      </button>
                    )}
                    {d.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => act(d.id, 'archive')}
                        className="text-slate-600 hover:underline"
                      >
                        下架
                      </button>
                    )}
                    {d.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => act(d.id, 'retry')}
                        className="text-orange-700 hover:underline"
                      >
                        重试
                      </button>
                    )}
                    <a
                      href={`/api/workspace/policies/${d.id}/file`}
                      className="text-blue-700 hover:underline"
                    >
                      下载原件
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  还没有符合条件的制度，点右上角「上传制度」开始。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        只有已发布、在有效期内、适用员工部门的制度才会用于回答；扫描件 PDF 需要先做文字识别。
        原始文件保存在服务端，下载必须登录且有权限。
      </p>

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">上传制度</h3>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                制度文件（PDF / Word .docx / 文本）
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1.5 w-full text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                制度名称
                <input
                  className={INPUT}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 示例报销制度"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  分类
                  <select
                    className={INPUT}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {POLICY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  适用范围
                  <select
                    className={INPUT}
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  >
                    <option value="all">全员</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  版本号
                  <input
                    className={INPUT}
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  生效日期
                  <input
                    type="date"
                    className={INPUT}
                    value={form.effectiveDate}
                    onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                  />
                </label>
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={busy}
                className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? '正在上传…' : '开始上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{detail.name} · 解析正文预览</h3>
            <p className="mt-1 text-xs text-slate-500">
              请确认没有乱码、表格内容没有丢失，再发布给员工。
            </p>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {detail.content}
            </pre>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="mt-5 w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
