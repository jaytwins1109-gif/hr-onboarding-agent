/**
 * 聊天日志落库的纯函数单测（lib/chat/logger.ts）。
 *
 * ADMIN_REVIEW_SCOPE 是隐私边界：guest_only 模式下注册用户的对话**不落库**，
 * 这些断言挂了等于把个人数据记进审查表。落库本身是 fire-and-forget（不测 DB），
 * 这里只固化开关判定纯函数（旧业务的卡片精简 slimCards 已随 Message.cards 删除）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldLog } from '@/lib/chat/logger';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ADMIN_REVIEW_SCOPE 开关', () => {
  it('未配置 → 默认 all：游客与注册用户都记', () => {
    vi.stubEnv('ADMIN_REVIEW_SCOPE', '');
    expect(shouldLog(true)).toBe(true);
    expect(shouldLog(false)).toBe(true);
  });

  it('all → 都记', () => {
    vi.stubEnv('ADMIN_REVIEW_SCOPE', 'all');
    expect(shouldLog(true)).toBe(true);
    expect(shouldLog(false)).toBe(true);
  });

  it('guest_only → 只记游客，注册用户跳过', () => {
    vi.stubEnv('ADMIN_REVIEW_SCOPE', 'guest_only');
    expect(shouldLog(true)).toBe(true);
    expect(shouldLog(false)).toBe(false);
  });

  it('大小写与首尾空格不敏感', () => {
    vi.stubEnv('ADMIN_REVIEW_SCOPE', ' GUEST_ONLY ');
    expect(shouldLog(false)).toBe(false);
    expect(shouldLog(true)).toBe(true);
  });

  it('配置成别的值 → 按 all 处理（不会误伤记录）', () => {
    vi.stubEnv('ADMIN_REVIEW_SCOPE', 'whatever');
    expect(shouldLog(false)).toBe(true);
  });
});
