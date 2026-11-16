'use client';

// 第 17 段回答气泡：带 [n] 角标的结论 + 可展开的引用详情。
//
// XSS 红线：所有来自模型 / 制度原文 / 用户提问的内容都只作为 React **文本节点**渲染
// （{value}、<pre>{value}</pre>、<a href>），本文件不调用任何原始 HTML 注入 API、
// 不拼接 HTML 字符串、不把模型输出当 URL 使用。下载链接由服务端按 policyId 生成。

import { useState } from 'react';
import { ChevronDown, FileDown, ShieldCheck } from 'lucide-react';
import {
  safeDisplayText,
  type AnswerPayload,
  type CitationSnapshot,
} from '@/lib/workspace/answer-schema';

interface Props {
  payload: AnswerPayload;
  time: string;
}

function CitationDetail({ citation }: { citation: CitationSnapshot }) {
  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
      <p className="text-xs font-semibold text-slate-900">
        [{citation.id}] {safeDisplayText(citation.policyName)} · {safeDisplayText(citation.version)}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        {safeDisplayText(citation.location)} · 生效日期{' '}
        {safeDisplayText(citation.effectiveDate ?? '未标注')} · 适用范围{' '}
        {safeDisplayText(citation.scope ?? '未标注')}
      </p>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-2 font-sans text-xs leading-relaxed text-slate-700">
        {safeDisplayText(citation.excerpt)}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        <a
          href={citation.downloadUrl}
          className="inline-flex items-center gap-1 text-blue-700 underline decoration-blue-300 underline-offset-2"
        >
          <FileDown className="h-3.5 w-3.5" />
          下载原始文档
        </a>
        {citation.isDemo && <span className="text-amber-700">示例制度，仅用于体验</span>}
      </div>
    </div>
  );
}

export function AnswerBubble({ payload, time }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const byId = new Map(payload.citations.map((citation) => [citation.id, citation]));
  const used = payload.citations.filter((citation) => citation.used);
  const opened = openId === null ? null : (byId.get(openId) ?? null);

  return (
    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
            payload.status === 'insufficient' || payload.status === 'conflict'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          <ShieldCheck className="h-3 w-3" />
          {payload.statusLabel}
        </span>
        <span className="text-slate-400">{time}</span>
      </div>

      {payload.conclusions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {payload.conclusions.map((conclusion, index) => (
            <p key={index} className="whitespace-pre-wrap break-words">
              {safeDisplayText(conclusion.text)}{' '}
              {conclusion.citationIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOpenId(openId === id ? null : id)}
                  aria-label={`查看第 ${id} 处引用`}
                  className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-baseline text-[11px] font-semibold transition ${
                    openId === id
                      ? 'bg-blue-700 text-white'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  [{id}]
                </button>
              ))}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-slate-600">依据不足，暂不能给出带出处的回答。</p>
      )}

      {payload.missing.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
          {payload.missing.map((item, index) => (
            <li key={index}>{safeDisplayText(item)}</li>
          ))}
        </ul>
      )}
      {payload.conflicts.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {payload.conflicts.map((item, index) => (
            <li key={index}>{safeDisplayText(item)}</li>
          ))}
        </ul>
      )}

      {opened && <CitationDetail citation={opened} />}

      {used.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-600">回答依据 · {used.length} 处引用</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {used.map((citation) => (
              <button
                key={citation.id}
                type="button"
                onClick={() => setOpenId(openId === citation.id ? null : citation.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 transition hover:border-blue-400 hover:text-blue-700"
              >
                <ChevronDown
                  className={`h-3 w-3 transition ${openId === citation.id ? 'rotate-180' : ''}`}
                />
                [{citation.id}] {safeDisplayText(citation.policyName)} ·{' '}
                {safeDisplayText(citation.version)}
              </button>
            ))}
          </div>
        </div>
      )}

      {payload.notice && (
        <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
          {safeDisplayText(payload.notice)}
        </p>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        依据已按原文规则核对 · 耗时 {payload.elapsedMs} ms · {safeDisplayText(payload.model)}
      </p>
    </div>
  );
}
