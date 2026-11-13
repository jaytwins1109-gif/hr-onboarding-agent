// lib/workspace/retrieval.ts
//
// 制度原文检索（文档第 16 步）：只做「找原文」，不生成回答。
//
// 三条红线：
//   1. **先过滤权限，再排序**：只允许 canViewPolicy 通过的制度进入候选池，
//      与制度中心列表 / 详情 / 下载共用同一套可见性规则，绝不各写一套。
//   2. 两路候选（关键词命中 + 意思相近）各自排序后用 RRF 合并，最终只取前 N 段；
//      每段都带制度 id / 名称 / 版本 / 位置，供后续引用与核验。
//   3. 诚实标注能力边界：本机试点版没有向量模型或外部 Embedding 服务，
//      「意思相近」是字面字词重合度的近似，不是真正的语义理解；分数只用于排序。
//
// 制度每次查询都实时读库切片，所以发布 / 下架 / 改适用范围后，结果当下就变。

import { canViewPolicy, type PolicyVisibilityFields } from './policies';

export const SCORE_NOTE = '分数仅用于排序，不是可信概率';
export const SEMANTIC_NOTE =
  '本机试点版的「意思相近」按字面字词重合度近似计算，没有向量模型，不能当成语义理解。';

export const DEFAULT_TOP_K = 4;
export const MAX_TOP_K = 20;
export const DEFAULT_PER_ROUTE = 20;
const MAX_CHUNK_CHARS = 480;
const RRF_K = 60;

export interface RetrievalPolicy extends PolicyVisibilityFields {
  id: string;
  name: string;
  category: string;
  version: string;
  content: string;
}

export interface PolicyChunk {
  /** `${policyId}#${index}`，同一份制度重切后编号稳定，便于比对「当前切片已变化」 */
  chunkId: string;
  policyId: string;
  policyName: string;
  category: string;
  version: string;
  /** 「第 3 段 · 三、具体标准」 */
  location: string;
  sectionTitle: string;
  index: number;
  text: string;
  /** 正文指纹：制度改版后用来判断旧引用对应的切片是否变了 */
  fingerprint: string;
}

export interface RetrievedChunk extends PolicyChunk {
  /** 合并后的排序分（0~1，只用于排序） */
  score: number;
  keywordScore: number;
  semanticScore: number;
  /** 这一段是从哪一路（或两路）候选进来的 */
  via: ('keyword' | 'semantic')[];
}

export interface RetrievalOptions {
  /** 最终保留的原文段数，1~20 */
  topK?: number;
  /** 每路候选数量，默认 20 */
  perRoute?: number;
  /** 注入时间便于单测，默认当前北京时间 */
  now?: Date;
}

export interface RetrievalResult {
  question: string;
  department: string | null;
  /** 通过可见性规则的制度数（权限过滤发生在切片与排序之前） */
  visiblePolicyCount: number;
  /** 候选池里一共切出多少段 */
  chunkCount: number;
  chunks: RetrievedChunk[];
  scoreNote: string;
  semanticNote: string;
}

// 只认「一、」「第一章」「# 标题」这类章节行；「1. 住宿费：…」是带条件的正文条目，
// 不能被当成标题切走，否则金额与它适用的条件会分到两段里。
const HEADING_RE =
  /^(?:#{1,6}\s+|第[一二三四五六七八九十百零〇\d]+[章节条部分]\s*|[一二三四五六七八九十]+[、.]\s*)\S/;

/** 无依赖的短指纹，只用来比对「这段原文还是不是当初那一段」 */
export function chunkFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 按「标题 → 段落 → 行」切分，尽量不把金额与它适用的条件切到两段里。
 * 位置信息（制度、版本、章节、段号）全都留在切片上，不因切分丢失。
 */
export function splitPolicy(policy: RetrievalPolicy): PolicyChunk[] {
  const lines = String(policy.content ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const chunks: PolicyChunk[] = [];
  let sectionTitle = '';
  let buffer: string[] = [];
  let bufferChars = 0;

  const flush = () => {
    const text = buffer.join('\n').trim();
    buffer = [];
    bufferChars = 0;
    if (!text) return;
    const index = chunks.length + 1;
    chunks.push({
      chunkId: `${policy.id}#${index}`,
      policyId: policy.id,
      policyName: policy.name,
      category: policy.category,
      version: policy.version,
      sectionTitle,
      location: sectionTitle ? `第 ${index} 段 · ${sectionTitle}` : `第 ${index} 段`,
      index,
      text,
      fingerprint: chunkFingerprint(text),
    });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (HEADING_RE.test(line)) {
      flush();
      sectionTitle = line.replace(/^#{1,6}\s*/, '').slice(0, 60);
      // 标题本身也进正文，保证「按章节找」时原文里能看到标题
      buffer = [line];
      bufferChars = line.length;
      continue;
    }
    if (bufferChars + line.length + 1 > MAX_CHUNK_CHARS && buffer.length > 0) flush();
    buffer.push(line);
    bufferChars += line.length + 1;
  }
  flush();
  return chunks;
}

// 语气词、标点、量词等高频字当分隔符，避免「的 / 吗 / 请问」把相似度刷满。
const STOP_CHARS = new Set(
  '的了吗呢啊吧是我你您请问帮想问下有在和或及与对被把从到这那哪个什么多少可以还需能会要个之其也很更最就不没请给说一下嘛呀哈，。；：、（）()【】「」《》“”‘’!！?？~～—…· \t',
);

/**
 * 抽词：中文单字 + 相邻双字（近似「意思相近」）、英文词与数字整体保留。
 * 纯函数，导出来给单测钉住「同义改写也能召回」这条底线。
 */
export function extractTokens(text: string): string[] {
  const out: string[] = [];
  const source = String(text ?? '').toLowerCase();
  const pieces = source.match(/[\p{Script=Han}]+|[a-z0-9]+(?:\.[0-9]+)?/gu) ?? [];
  for (const piece of pieces) {
    if (/^[a-z0-9]/.test(piece)) {
      if (piece.length >= 2 || /\d/.test(piece)) out.push(piece);
      continue;
    }
    let run = '';
    const emit = () => {
      for (let i = 0; i < run.length; i += 1) {
        out.push(run[i]);
        if (i + 1 < run.length) out.push(run.slice(i, i + 2));
      }
      run = '';
    };
    for (const char of piece) {
      if (STOP_CHARS.has(char)) emit();
      else run += char;
    }
    emit();
  }
  return out;
}

/** 查询词去重后用于关键词路；单字权重低，双字/数字词权重高 */
export function queryTerms(text: string): string[] {
  return [...new Set(extractTokens(text))];
}

function termWeight(term: string): number {
  return term.length >= 2 ? 1 : 0.3;
}

/** 关键词路：命中了多少查询词（0~1） */
export function keywordScore(terms: string[], chunk: PolicyChunk): number {
  if (!terms.length) return 0;
  const pool = new Set(extractTokens(`${chunk.sectionTitle} ${chunk.text}`));
  const total = terms.reduce((sum, term) => sum + termWeight(term), 0);
  const hit = terms.reduce((sum, term) => sum + (pool.has(term) ? termWeight(term) : 0), 0);
  return total ? hit / total : 0;
}

/** 意思相近路：词面重合的余弦近似（0~1），注意这不是向量语义 */
export function semanticScore(query: string, chunk: PolicyChunk): number {
  const a = new Set(extractTokens(query));
  const b = new Set(extractTokens(`${chunk.sectionTitle} ${chunk.text}`));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / Math.sqrt(a.size * b.size);
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function rankByScore(chunks: PolicyChunk[], score: (c: PolicyChunk) => number): PolicyChunk[] {
  return chunks
    .map((chunk) => ({ chunk, value: score(chunk) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.chunk.chunkId.localeCompare(b.chunk.chunkId))
    .map((row) => row.chunk);
}

/**
 * 从已发布制度里找与问题最相关的原文片段。
 * 顺序固定为：可见性过滤 → 切片 → 两路候选 → 合并排序 → 取前 N。
 */
export function retrieveForQuestion(
  question: string,
  policies: RetrievalPolicy[],
  department: string | null,
  options: RetrievalOptions = {},
): RetrievalResult {
  const topK = clampInt(options.topK, DEFAULT_TOP_K, 1, MAX_TOP_K);
  const perRoute = clampInt(options.perRoute, DEFAULT_PER_ROUTE, 1, 100);
  const now = options.now ?? new Date();
  const q = String(question ?? '').trim();

  // 1. 权限永远在排序之前：不可见的制度连切片都不做。
  const visible = policies.filter((policy) => canViewPolicy(policy, department, now));
  const pool = visible.flatMap((policy) => splitPolicy(policy));

  const terms = queryTerms(q);
  const keywordRanked = rankByScore(pool, (chunk) => keywordScore(terms, chunk)).slice(0, perRoute);
  const semanticRanked = rankByScore(pool, (chunk) => semanticScore(q, chunk)).slice(0, perRoute);

  // 2. RRF（倒数排名融合）把两路候选并成一份榜单，不要求两路分数量纲一致。
  const merged = new Map<string, RetrievedChunk>();
  const add = (chunk: PolicyChunk, rank: number, route: 'keyword' | 'semantic') => {
    const current = merged.get(chunk.chunkId) ?? {
      ...chunk,
      score: 0,
      keywordScore: keywordScore(terms, chunk),
      semanticScore: semanticScore(q, chunk),
      via: [] as ('keyword' | 'semantic')[],
    };
    current.score += 1 / (RRF_K + rank + 1);
    if (!current.via.includes(route)) current.via.push(route);
    merged.set(chunk.chunkId, current);
  };
  keywordRanked.forEach((chunk, rank) => add(chunk, rank, 'keyword'));
  semanticRanked.forEach((chunk, rank) => add(chunk, rank, 'semantic'));

  // 归一化到 0~1，纯粹为了页面展示好看；语义不变：只用于排序。
  const maxRrf = 2 / (RRF_K + 1);
  const chunks = [...merged.values()]
    .map((chunk) => ({ ...chunk, score: Math.min(1, chunk.score / maxRrf) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.keywordScore - a.keywordScore || a.chunkId.localeCompare(b.chunkId),
    )
    .slice(0, topK);

  return {
    question: q,
    department,
    visiblePolicyCount: visible.length,
    chunkCount: pool.length,
    chunks,
    scoreNote: SCORE_NOTE,
    semanticNote: SEMANTIC_NOTE,
  };
}
