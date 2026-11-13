/**
 * 员工咨询会话（文档第 15 步）的纯规则测试：
 * 输入门槛、侧栏标题、本人归属、12 条上限、占位回复不编造结论。
 */
import { describe, expect, it } from 'vitest';
import {
  canReadConsultation,
  checkQuestion,
  consultationTitle,
  limitRecentConsultations,
  MAX_QUESTION_LENGTH,
  MAX_RECENT_CONSULTATIONS,
  PLACEHOLDER_REPLY,
  TITLE_MAX_LENGTH,
} from '@/lib/workspace/consultations';

describe('checkQuestion（服务端唯一的提问门槛）', () => {
  it('非字符串 / 空白 → 拒绝，并给中文提示', () => {
    expect(checkQuestion(undefined).ok).toBe(false);
    expect(checkQuestion(42).ok).toBe(false);
    expect(checkQuestion('   \n  ').ok).toBe(false);
    expect(checkQuestion('').error).toContain('请输入');
  });

  it('正常提问返回去掉首尾空白的原话', () => {
    expect(checkQuestion('  我还有几天年假？  ')).toEqual({
      ok: true,
      value: '我还有几天年假？',
    });
  });

  it('超过 2000 字拒绝，正好 2000 字放行', () => {
    expect(checkQuestion('啊'.repeat(MAX_QUESTION_LENGTH + 1)).ok).toBe(false);
    expect(checkQuestion('啊'.repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
  });
});

describe('consultationTitle（最近咨询的标题取第一个问题）', () => {
  it('换行与连续空白压成一行', () => {
    expect(consultationTitle('年假可以\n结转  到明年吗？')).toBe('年假可以 结转 到明年吗？');
  });

  it('空串回退「新咨询」，超长截断并加省略号', () => {
    expect(consultationTitle('   ')).toBe('新咨询');
    const title = consultationTitle('很'.repeat(TITLE_MAX_LENGTH + 10));
    expect(title).toHaveLength(TITLE_MAX_LENGTH + 1);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('canReadConsultation（对话只属于提问人本人）', () => {
  it('本人可读；别人的会话 id 一律不可读', () => {
    expect(canReadConsultation('u_1', 'u_1')).toBe(true);
    expect(canReadConsultation('u_1', 'u_2')).toBe(false);
    expect(canReadConsultation('', '')).toBe(false);
  });
});

describe('limitRecentConsultations（最多 12 条）', () => {
  it('超过 12 条只留前 12 条，不足时原样返回', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: `c_${i}` }));
    expect(limitRecentConsultations(rows)).toHaveLength(MAX_RECENT_CONSULTATIONS);
    expect(limitRecentConsultations(rows)[0].id).toBe('c_0');
    expect(limitRecentConsultations(rows.slice(0, 3))).toHaveLength(3);
    expect(MAX_RECENT_CONSULTATIONS).toBe(12);
  });
});

describe('PLACEHOLDER_REPLY（本步只占位，绝不编造制度结论）', () => {
  it('明示占位与依据尚未接入', () => {
    expect(PLACEHOLDER_REPLY).toContain('占位回复');
    expect(PLACEHOLDER_REPLY).toContain('依据');
  });

  it('不含任何具体数字、天数或金额', () => {
    expect(/\d/.test(PLACEHOLDER_REPLY)).toBe(false);
    expect(PLACEHOLDER_REPLY).not.toContain('元');
    expect(PLACEHOLDER_REPLY).not.toContain('天');
  });
});
