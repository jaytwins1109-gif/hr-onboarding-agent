/**
 * 制度原文检索（文档第 16 步）的离线测试。
 * 重点钉住三条：权限先于排序、两路候选合并、每段都带可核对的出处。
 */
import { describe, expect, it } from 'vitest';
import {
  chunkFingerprint,
  DEFAULT_TOP_K,
  keywordScore,
  MAX_TOP_K,
  queryTerms,
  retrieveForQuestion,
  SCORE_NOTE,
  SEMANTIC_NOTE,
  semanticScore,
  splitPolicy,
  type RetrievalPolicy,
} from '@/lib/workspace/retrieval';
import { canUseRetrievalTest } from '@/lib/workspace/access';

const NOW = new Date('2026-11-13T02:00:00.000Z'); // 北京时间 2026-11-13

const REIMBURSE = [
  '一、住宿标准',
  '出差住宿：一线城市上限 500 元/人/晚，二线城市上限 350 元/人/晚。',
  '2. 餐费：出差期间每人每天 80 元定额。',
  '',
  '二、提交时限',
  '出差结束后 15 个自然日内提交报销单，跨月不得超过次月 10 日。',
].join('\n');

function policy(over: Partial<RetrievalPolicy> = {}): RetrievalPolicy {
  return {
    id: 'p_reimburse',
    name: '示例报销制度',
    category: '报销制度',
    version: 'v1.0',
    status: 'published',
    effectiveDate: '2026-01-01',
    scope: 'all',
    content: REIMBURSE,
    ...over,
  };
}

describe('splitPolicy（切片保留来源与位置）', () => {
  it('每段带制度 id / 名称 / 版本 / 章节位置 / 稳定编号', () => {
    const chunks = splitPolicy(policy());
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.chunkId).toBe(`p_reimburse#${chunk.index}`);
      expect(chunk.policyId).toBe('p_reimburse');
      expect(chunk.policyName).toBe('示例报销制度');
      expect(chunk.version).toBe('v1.0');
      expect(chunk.location).toContain(`第 ${chunk.index} 段`);
      expect(chunk.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(chunks[0].location).toContain('一、住宿标准');
  });

  it('金额与它适用的条件留在同一段，编号正文行不被当成标题', () => {
    const lodging = splitPolicy(policy()).find((chunk) => chunk.text.includes('500'));
    expect(lodging?.text).toContain('一线城市');
    expect(lodging?.sectionTitle).toBe('一、住宿标准');
  });

  it('正文改动后指纹变化，原样重切指纹不变', () => {
    const before = splitPolicy(policy())[0];
    const after = splitPolicy(policy({ content: REIMBURSE.replace('500', '600') }))[0];
    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(chunkFingerprint(before.text)).toBe(before.fingerprint);
    expect(splitPolicy(policy())[0].fingerprint).toBe(before.fingerprint);
  });
});

describe('两路候选（关键词命中 / 意思相近）', () => {
  const chunks = splitPolicy(policy());

  it('关键词路与意思相近路都能给相关片段打分', () => {
    const target = chunks.find((chunk) => chunk.text.includes('500'))!;
    expect(keywordScore(queryTerms('出差住宿上限'), target)).toBeGreaterThan(0);
    expect(semanticScore('住在酒店能报多少钱', target)).toBeGreaterThan(0);
  });

  it('完全无关的问题两路都不得分', () => {
    const unrelated = splitPolicy(policy({ content: '一、办公用品\n领用签字后到行政部领取。' }))[0];
    expect(keywordScore(queryTerms('出差住宿上限'), unrelated)).toBe(0);
    expect(semanticScore('出差住宿上限', unrelated)).toBe(0);
  });

  it('停用字不把相似度刷满：泛泛一问仍低于具体提问', () => {
    const target = chunks.find((chunk) => chunk.text.includes('500'))!;
    expect(semanticScore('出差住宿一线城市上限', target)).toBeGreaterThan(
      semanticScore('请问一下', target),
    );
  });
});

describe('retrieveForQuestion（权限过滤 → 切片 → 合并排序 → 取前 N）', () => {
  it('命中片段带制度名称、版本、位置与候选来源', () => {
    const result = retrieveForQuestion('出差住宿报销上限是多少', [policy()], '产品部', {
      now: NOW,
    });
    expect(result.visiblePolicyCount).toBe(1);
    expect(result.chunks.length).toBeGreaterThan(0);
    const first = result.chunks[0];
    expect(first.text).toContain('500');
    expect(first.policyName).toBe('示例报销制度');
    expect(first.version).toBe('v1.0');
    expect(first.location).toContain('一、住宿标准');
    expect(first.via.length).toBeGreaterThan(0);
    expect(first.via.every((v) => v === 'keyword' || v === 'semantic')).toBe(true);
  });

  it('不可见的制度连切片都不做：下架 / 未生效 / 跨部门 / 未发布全部排除', () => {
    const hidden = [
      policy({ id: 'p_archived', status: 'archived' }),
      policy({ id: 'p_future', effectiveDate: '2026-12-01' }),
      policy({ id: 'p_other_dept', scope: '技术部' }),
      policy({ id: 'p_pending', status: 'pending' }),
    ];
    const result = retrieveForQuestion('出差住宿上限 500 元', hidden, '产品部', { now: NOW });
    expect(result.visiblePolicyCount).toBe(0);
    expect(result.chunkCount).toBe(0);
    expect(result.chunks).toEqual([]);
  });

  it('高度相关但越权的制度也不能混进结果（权限先于排序）', () => {
    const visible = policy({ id: 'p_ok', content: '一、交通\n市内交通单日上限 100 元。' });
    const forbidden = policy({ id: 'p_secret', scope: '技术部' });
    const result = retrieveForQuestion('出差住宿上限 500 元', [forbidden, visible], '产品部', {
      now: NOW,
    });
    expect(result.visiblePolicyCount).toBe(1);
    expect(result.chunks.every((chunk) => chunk.policyId === 'p_ok')).toBe(true);
  });

  it('制度被下架 / 改适用范围后，查找结果随之变化', () => {
    const question = '出差住宿上限 500 元';
    const before = retrieveForQuestion(question, [policy()], '产品部', { now: NOW });
    expect(before.chunks.length).toBeGreaterThan(0);

    const archived = retrieveForQuestion(question, [policy({ status: 'archived' })], '产品部', {
      now: NOW,
    });
    expect(archived.chunks).toEqual([]);

    const otherDept = retrieveForQuestion(question, [policy({ scope: '技术部' })], '产品部', {
      now: NOW,
    });
    expect(otherDept.chunks).toEqual([]);
  });

  it('本部门专属制度对该部门可见、对其他部门不可见', () => {
    const scoped = policy({ id: 'p_product', scope: '产品部' });
    expect(
      retrieveForQuestion('出差住宿上限', [scoped], '产品部', { now: NOW }).visiblePolicyCount,
    ).toBe(1);
    expect(
      retrieveForQuestion('出差住宿上限', [scoped], '销售部', { now: NOW }).visiblePolicyCount,
    ).toBe(0);
  });

  it('topK 限制在 1~20，默认 4', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      policy({ id: `p_${i}`, name: `示例制度 ${i}` }),
    );
    expect(retrieveForQuestion('出差住宿上限', many, '产品部', { now: NOW }).chunks).toHaveLength(
      DEFAULT_TOP_K,
    );
    expect(
      retrieveForQuestion('出差住宿上限', many, '产品部', { now: NOW, topK: 2 }).chunks,
    ).toHaveLength(2);
    expect(
      retrieveForQuestion('出差住宿上限', many, '产品部', { now: NOW, topK: 0 }).chunks,
    ).toHaveLength(1);
    expect(
      retrieveForQuestion('出差住宿上限', many, '产品部', { now: NOW, topK: 999 }).chunks.length,
    ).toBeLessThanOrEqual(MAX_TOP_K);
  });

  it('分数只用于排序，并诚实说明没有向量语义', () => {
    const result = retrieveForQuestion('出差住宿上限', [policy()], '产品部', { now: NOW });
    for (const chunk of result.chunks) {
      expect(chunk.score).toBeGreaterThanOrEqual(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }
    expect(result.scoreNote).toContain('不是可信概率');
    expect(result.semanticNote).toContain('没有向量模型');
    expect(SCORE_NOTE).toContain('排序');
    expect(SEMANTIC_NOTE).toContain('近似');
  });
});

describe('canUseRetrievalTest（查找测试仅管理员）', () => {
  it('HR 管理员与系统管理员可用，员工与产品运营不可用', () => {
    expect(canUseRetrievalTest('ADMIN')).toBe(true);
    expect(canUseRetrievalTest('DEVELOPER')).toBe(true);
    expect(canUseRetrievalTest('USER')).toBe(false);
    expect(canUseRetrievalTest('PRODUCT_OPS')).toBe(false);
    expect(canUseRetrievalTest(null)).toBe(false);
  });
});
