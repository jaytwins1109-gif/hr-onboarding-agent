// lib/workspace/answer-schema.ts
//
// 第 17 段「AI 带引用回答」的类型、严格 JSON 解析、确定性规则核验与回答组装。
// 纯函数模块：不碰数据库、不引 node / prisma 依赖，服务端与客户端共用同一套类型。
//
// 三条红线：
//   1. **引用编号由服务端分配**，模型只回数字编号；制度名称 / 版本 / 位置 / 原文 / 下载链接
//      全部由服务端从检索结果回填，模型碰不到，从根上杜绝「编造出处」。
//   2. **没通过核验的结论不展示**：编号越界、原文指纹不符、声称的证据不是原文子串、
//      结论里的数字与所引原文对不上，一律剔除；全被剔除就降级「依据不足」。
//   3. 模型输出解析失败 / 字段缺失 / 枚举越界 → 固定兜底对象，绝不把原始输出给员工。
//
// 输出形态沿用旧 structured_json 的红线：面向用户的文本里不出现字段名、花括号、
// JSON 代码块；本模块返回的是结构化对象，UI 用纯文本节点渲染（见 answer-bubble.tsx）。

import { chunkFingerprint, type RetrievedChunk } from './retrieval';

export const ANSWER_STATUSES = ['supported', 'partial', 'insufficient', 'conflict'] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const STATUS_LABEL: Record<AnswerStatus, string> = {
  supported: '依据充分',
  partial: '部分有依据',
  insufficient: '依据不足',
  conflict: '制度说法有冲突',
};

export const DEMO_NOTICE = '本机演示模式未配置真实模型，暂不生成带依据回答。';
export const EXAMPLE_POLICY_NOTICE = '当前引用示例制度，仅用于体验，不代表真实公司政策。';
export const NO_EXCERPT_NOTICE = '没有找到可用原文片段，无法生成带依据回答。';

export interface RawConclusion {
  text: string;
  citationIds: number[];
  /** 模型声称引用到的那句原文；可选，给了就必须能在所引片段里逐字找到 */
  evidence?: string;
}

export interface RawLlmAnswer {
  status: AnswerStatus;
  conclusions: RawConclusion[];
  missing: string[];
  conflicts: string[];
}

export interface PolicyMeta {
  effectiveDate?: string | null;
  scope?: string | null;
}

export interface CitationSnapshot {
  /** 服务端分配的编号，与 `[n]` 角标一一对应 */
  id: number;
  chunkId: string;
  policyId: string;
  policyName: string;
  version: string;
  location: string;
  effectiveDate: string | null;
  scope: string | null;
  /** 原文摘录：始终是 chunk.text 的前缀，保证是原文子串 */
  excerpt: string;
  fingerprint: string;
  isDemo: boolean;
  used: boolean;
  downloadUrl: string;
}

export interface AnswerConclusion {
  text: string;
  citationIds: number[];
}

/** 个人年假账本的一条流水引用（日期 + 事由 + 增减），作为余额的逐条依据 */
export interface LedgerEntryRef {
  date: string;
  reason: string;
  delta: number;
}

export interface AnswerPayload {
  status: AnswerStatus;
  statusLabel: string;
  conclusions: AnswerConclusion[];
  citations: CitationSnapshot[];
  missing: string[];
  conflicts: string[];
  notice: string | null;
  /** 个人年假回答的账本流水引用；只列原始记录，不写解释话术 */
  ledgerEntries?: LedgerEntryRef[];
  model: string;
  elapsedMs: number;
  /** 是否所有结论都通过了确定性规则核验 */
  verified: boolean;
  /** 被拦下的原因（仅用于审计/调试，不直接展示给员工） */
  rejected: string[];
}

export type ParseResult = { ok: true; value: RawLlmAnswer } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stripFence(text: string): string {
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : text;
}

/**
 * 严格解析模型输出：只认 JSON 对象，字段类型、枚举、编号范围、结论与状态的一致性都要过。
 * 容错仅限于剥掉常见的 ```json 围栏；解析或校验失败一律回兜底。
 */
export function parseLlmAnswer(raw: unknown, maxCitationId: number): ParseResult {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const text = stripFence(raw.trim());
    if (!text) return { ok: false, error: '模型输出为空' };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: '模型输出不是合法 JSON' };
    }
  }
  if (!isRecord(value)) return { ok: false, error: '模型输出不是 JSON 对象' };

  const status = value.status;
  if (typeof status !== 'string' || !ANSWER_STATUSES.includes(status as AnswerStatus)) {
    return { ok: false, error: 'status 不是允许的四种取值' };
  }
  const rawConclusions = value.conclusions;
  if (!Array.isArray(rawConclusions)) {
    return { ok: false, error: 'conclusions 必须是数组' };
  }
  const missing = Array.isArray(value.missing)
    ? value.missing.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];
  const conflicts = Array.isArray(value.conflicts)
    ? value.conflicts.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];

  const conclusions: RawConclusion[] = [];
  for (const entry of rawConclusions) {
    if (!isRecord(entry) || typeof entry.text !== 'string' || !entry.text.trim()) {
      return { ok: false, error: '结论缺少非空 text' };
    }
    if (entry.text.length > 1200) return { ok: false, error: '结论过长' };
    if (!Array.isArray(entry.citation_ids) || entry.citation_ids.length === 0) {
      return { ok: false, error: '每条结论必须带至少一个引用编号' };
    }
    const ids: number[] = [];
    for (const id of entry.citation_ids) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > maxCitationId) {
        return { ok: false, error: '引用编号越界或不是整数' };
      }
      if (!ids.includes(id)) ids.push(id);
    }
    if (typeof entry.evidence === 'string' && entry.evidence.trim()) {
      conclusions.push({
        text: entry.text.trim(),
        citationIds: ids,
        evidence: entry.evidence.trim(),
      });
    } else {
      conclusions.push({ text: entry.text.trim(), citationIds: ids });
    }
  }

  if (status === 'insufficient' && (conclusions.length > 0 || missing.length === 0)) {
    return { ok: false, error: '依据不足时结论须为空且 missing 不能为空' };
  }
  if (status !== 'insufficient' && conclusions.length === 0) {
    return { ok: false, error: '非依据不足状态必须给出至少一条结论' };
  }
  if (status === 'conflict' && conflicts.length === 0) {
    return { ok: false, error: '冲突状态必须列出冲突说明' };
  }

  return {
    ok: true,
    value: {
      status: status as AnswerStatus,
      conclusions,
      missing,
      conflicts,
    },
  };
}

/** 编号 → 引用快照；原文摘录永远是 chunk.text 的前缀（严格子串） */
export function buildCitationSnapshots(
  chunks: RetrievedChunk[],
  usedIds: number[] = [],
  meta: Record<string, PolicyMeta> = {},
): CitationSnapshot[] {
  return chunks.map((chunk, index) => {
    const id = index + 1;
    const policy = meta[chunk.policyId] ?? {};
    return {
      id,
      chunkId: chunk.chunkId,
      policyId: chunk.policyId,
      policyName: chunk.policyName,
      version: chunk.version,
      location: chunk.location,
      effectiveDate: policy.effectiveDate ?? null,
      scope: policy.scope ?? null,
      excerpt: chunk.text.slice(0, 240),
      fingerprint: chunk.fingerprint,
      isDemo: /示例/.test(chunk.policyName),
      used: usedIds.includes(id),
      downloadUrl: `/api/workspace/policies/${encodeURIComponent(chunk.policyId)}/file`,
    };
  });
}

/** 整组候选片段的指纹：制度改版或重切后可用于判断「当前切片已变化」 */
export function sourceFingerprint(chunks: RetrievedChunk[]): string {
  return chunkFingerprint(chunks.map((c) => `${c.chunkId}:${c.fingerprint}`).join('|'));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, '');
}

/** 结论里的数字（忽略 [n] 角标与个位数序号）必须与所引原文里的数字对得上 */
function numbersIn(text: string): string[] {
  return (text.replace(/\[\d+\]/g, '').match(/\d+(?:\.\d+)?/g) ?? []).filter(
    (value) => value.replace(/\D/g, '').length >= 2,
  );
}

export interface VerifyResult {
  conclusions: AnswerConclusion[];
  rejected: string[];
  usedIds: number[];
}

/**
 * 确定性规则核验：编号存在、原文指纹未变、声称的证据是原文子串、数字逐字一致。
 * 任一不通过 → 该结论整条剔除（不展示），不是「删掉一角标继续展示」。
 */
export function verifyConclusions(answer: RawLlmAnswer, chunks: RetrievedChunk[]): VerifyResult {
  const conclusions: AnswerConclusion[] = [];
  const rejected: string[] = [];
  const usedIds: number[] = [];

  answer.conclusions.forEach((conclusion, index) => {
    const label = `第 ${index + 1} 条结论`;
    const targets = conclusion.citationIds.map((id) => chunks[id - 1]);
    if (targets.some((chunk) => !chunk)) {
      rejected.push(`${label}：引用编号不在候选片段内`);
      return;
    }
    const mismatch = targets.find((chunk) => chunkFingerprint(chunk.text) !== chunk.fingerprint);
    if (mismatch) {
      rejected.push(`${label}：原文指纹已变化，不展示`);
      return;
    }
    if (conclusion.evidence) {
      const evidence = normalize(conclusion.evidence);
      const found = targets.some((chunk) => normalize(chunk.text).includes(evidence));
      if (!found) {
        rejected.push(`${label}：声称的原文证据不在所引片段里`);
        return;
      }
    }
    const sourceNumbers = new Set(targets.flatMap((chunk) => numbersIn(chunk.text)));
    const wrongNumber = numbersIn(conclusion.text).find((num) => !sourceNumbers.has(num));
    if (wrongNumber) {
      rejected.push(`${label}：数字 ${wrongNumber} 与所引原文不一致`);
      return;
    }
    conclusions.push({ text: conclusion.text, citationIds: conclusion.citationIds });
    for (const id of conclusion.citationIds) if (!usedIds.includes(id)) usedIds.push(id);
  });

  return { conclusions, rejected, usedIds };
}

interface PayloadMeta {
  model: string;
  elapsedMs: number;
  notice?: string | null;
}

/** 固定兜底对象：任何失败路径都走这里，员工永远看不到模型原始输出 */
export function insufficientPayload(
  reason: string,
  meta: PayloadMeta,
  chunks: RetrievedChunk[] = [],
  policyMeta: Record<string, PolicyMeta> = {},
): AnswerPayload {
  return {
    status: 'insufficient',
    statusLabel: STATUS_LABEL.insufficient,
    conclusions: [],
    citations: buildCitationSnapshots(chunks, [], policyMeta),
    missing: [reason],
    conflicts: [],
    notice: meta.notice ?? null,
    model: meta.model,
    elapsedMs: meta.elapsedMs,
    verified: false,
    rejected: [],
  };
}

export interface AssembleInput extends PayloadMeta {
  question: string;
  chunks: RetrievedChunk[];
  mode: 'live' | 'unavailable';
  llmResponse: string | null;
  policyMeta?: Record<string, PolicyMeta>;
}

/**
 * 把「检索片段 + 模型输出 + 运行模式」组装成最终落库/回包的 AnswerPayload。
 * 纯函数，单测直接打这里：无 Key 降级、胡编编号、正确引用、数字幻觉全部覆盖。
 */
export function assembleAnswer(input: AssembleInput): AnswerPayload {
  const { chunks, llmResponse, mode, policyMeta = {} } = input;
  const meta: PayloadMeta = {
    model: input.model,
    elapsedMs: input.elapsedMs,
    notice: input.notice,
  };

  if (mode !== 'live') {
    return insufficientPayload(DEMO_NOTICE, { ...meta, notice: DEMO_NOTICE }, chunks, policyMeta);
  }
  if (chunks.length === 0) {
    return insufficientPayload(NO_EXCERPT_NOTICE, meta, chunks, policyMeta);
  }
  if (!llmResponse) {
    return insufficientPayload('模型没有返回内容，建议稍后重试或联系 HR', meta, chunks, policyMeta);
  }

  const parsed = parseLlmAnswer(llmResponse, chunks.length);
  if (!parsed.ok) {
    return insufficientPayload(
      `模型输出未通过格式校验（${parsed.error}）`,
      meta,
      chunks,
      policyMeta,
    );
  }

  const verified = verifyConclusions(parsed.value, chunks);
  const citations = buildCitationSnapshots(chunks, verified.usedIds, policyMeta);
  const usesDemoPolicy = citations.some((citation) => citation.used && citation.isDemo);
  const notice = input.notice ?? (usesDemoPolicy ? EXAMPLE_POLICY_NOTICE : null);

  let status = parsed.value.status;
  let missing = parsed.value.missing;
  if (verified.conclusions.length === 0) {
    status = 'insufficient';
    missing = [
      ...parsed.value.missing,
      '没有结论通过依据核验',
      ...verified.rejected.slice(0, 2),
    ].slice(0, 8);
  } else if (verified.rejected.length > 0 && status === 'supported') {
    status = 'partial';
  }

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    conclusions: verified.conclusions,
    citations,
    missing,
    conflicts: parsed.value.conflicts,
    notice,
    model: input.model,
    elapsedMs: input.elapsedMs,
    verified: verified.conclusions.length > 0 && verified.rejected.length === 0,
    rejected: verified.rejected,
  };
}

/** 只剥离不可见控制字符；`<script>` 等原样保留，交给 React 文本节点自动转义 */
export function safeDisplayText(text: string): string {
  // 按码点过滤，避免正则字面量里的控制字符触发 eslint no-control-regex。
  return [...text]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      const isControl = code <= 0x08 || (code >= 0x0b && code <= 0x1f);
      const isInvisible = (code >= 0x200b && code <= 0x200f) || code === 0xfeff;
      return !isControl && !isInvisible;
    })
    .join('');
}
