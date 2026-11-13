'use client';

// 制度中心：横幅 + 筛选 + 卡片列表 + 空状态 + 正文预览。
// 正文与下载都走服务端接口，那里会再次用同一套 canViewPolicy 校验。

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { POLICY_CATEGORIES, scopeLabel } from '@/lib/workspace/policies';

interface PolicyCard {
  id: string;
  name: string;
  category: string;
  scope: string;
  version: string;
  effectiveDate: string;
}

export function PolicyCenter({
  policies,
  department,
}: {
  policies: PolicyCard[];
  department: string;
}) {
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ name: string; content: string; id: string } | null>(null);
  const [error, setError] = useState('');

  const filtered = policies.filter((p) => {
    if (category && p.category !== category) return false;
    if (query.trim() && !p.name.includes(query.trim())) return false;
    return true;
  });
  const hasDemo = policies.some((p) => p.name.includes('示例'));

  async function openDetail(id: string) {
    setError('');
    const res = await fetch(`/api/workspace/policies/${id}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as {
      doc?: { name: string; content: string };
      error?: string;
    } | null;
    if (!res.ok || !data?.doc) {
      setError(data?.error || '读取制度正文失败');
      return;
    }
    setDetail({ id, name: data.doc.name, content: data.doc.content });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-slate-900 px-6 py-7 text-white">
        <h2 className="text-xl font-bold">每一项制度，都有清晰的依据</h2>
        <p className="mt-2 text-sm text-slate-300">
          你所在的部门：{department} · 可查看全员及本部门的有效制度
        </p>
      </section>

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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按制度名称搜索"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <section
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {scopeLabel(p.scope)}
                    </span>
                    <span className="text-xs text-slate-400">{p.category}</span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-slate-900">{p.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.version} · {p.effectiveDate} 生效
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => openDetail(p.id)}
                  className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  查看制度正文
                </button>
                <a
                  href={`/api/workspace/policies/${p.id}/file`}
                  className="flex items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
                >
                  下载
                </a>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">暂时没有符合条件的制度</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            这里只展示已发布、在有效期内、适用于全员或你所在部门的制度。
            可以换个分类或清空搜索词再看看，也可以联系 HR 确认是否需要发布新制度。
          </p>
        </div>
      )}

      {hasDemo && (
        <p className="text-xs text-slate-500">
          标题里带「示例」的制度仅用于演示，正式使用前由管理员替换。
        </p>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{detail.name}</h3>
            <p className="mt-1 text-xs text-slate-500">以下内容来自已发布制度的解析正文。</p>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {detail.content}
            </pre>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              >
                关闭
              </button>
              <a
                href={`/api/workspace/policies/${detail.id}/file`}
                className="flex flex-1 items-center justify-center rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white"
              >
                下载原始文档
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
