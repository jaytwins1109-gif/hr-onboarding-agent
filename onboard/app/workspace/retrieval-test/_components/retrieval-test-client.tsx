'use client';

// 查找测试：输入问题，只看「找到了哪几段原文、来自哪份制度」，不生成回答。
// 权限过滤在服务端先做，这里展示的每一段都是当前身份有权看到的制度。

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { DEFAULT_TOP_K, MAX_TOP_K } from '@/lib/workspace/retrieval';

interface Props {
  departments: string[];
  defaultDepartment: string;
}

interface ChunkView {
  chunkId: string;
  policyName: string;
  category: string;
  version: string;
  location: string;
  text: string;
  score: number;
  keywordScore: number;
  semanticScore: number;
  via: string[];
}

interface ResultView {
  visiblePolicyCount: number;
  chunkCount: number;
  chunks: ChunkView[];
  scoreNote: string;
  semanticNote: string;
}

const VIA_LABEL: Record<string, string> = {
  keyword: '关键词命中',
  semantic: '意思相近',
};

export function RetrievalTestClient({ departments, defaultDepartment }: Props) {
  const [question, setQuestion] = useState('');
  const [department, setDepartment] = useState(defaultDepartment);
  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [result, setResult] = useState<ResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workspace/retrieval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), department, topK }),
      });
      const data = (await res.json().catch(() => null)) as (ResultView & { error?: string }) | null;
      if (!res.ok) {
        setError(data?.error || '查找失败，请稍后再试');
        return;
      }
      setResult(data);
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">制度原文查找测试</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          输入一个问题，查看系统从已发布制度里找到了哪些原文片段。用来验收检索，不生成回答。
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px_120px]">
          <label className="block text-xs font-medium text-slate-600">
            问题
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void run();
              }}
              placeholder="例如：出差住宿报销上限是多少？"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            以哪个部门的员工身份
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600"
            >
              <option value="">本人部门</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            保留原文段数
            <input
              type="number"
              min={1}
              max={MAX_TOP_K}
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value) || DEFAULT_TOP_K)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !question.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {busy ? '正在查找…' : '开始查找'}
        </button>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
          <p>
            权限过滤始终在排序之前：只有已发布、在有效期内、适用全员或所选部门的制度会进入候选。
          </p>
          <p className="mt-1">
            意思相近与关键词命中两路候选合并后，最终只取前几段；分数仅用于排序，不是可信概率。
          </p>
        </div>
      </section>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-900">找到的原文片段</h3>
            <p className="text-xs text-slate-500">
              通过权限过滤 {result.visiblePolicyCount} 份制度 · 候选 {result.chunkCount} 段 ·
              最终保留 {result.chunks.length} 段
            </p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {result.scoreNote} {result.semanticNote}
          </p>

          {result.chunks.length === 0 ? (
            <p className="mt-6 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              没有找到相关原文。可以换个问法，或先确认制度已发布、已生效且适用于所选部门。
            </p>
          ) : (
            <ol className="mt-5 space-y-4">
              {result.chunks.map((chunk, index) => (
                <li key={chunk.chunkId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {chunk.policyName}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {chunk.version} · {chunk.location}
                      </span>
                    </p>
                    <span className="text-xs text-slate-500">排序分 {chunk.score.toFixed(3)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">{chunk.category}</span>
                    {chunk.via.map((via) => (
                      <span key={via} className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                        {VIA_LABEL[via] ?? via}
                      </span>
                    ))}
                    <span>关键词 {chunk.keywordScore.toFixed(3)}</span>
                    <span>意思相近 {chunk.semanticScore.toFixed(3)}</span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700">
                    {chunk.text}
                  </pre>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
