// lib/workspace/consultations.ts
//
// 员工咨询会话的纯规则（文档第 15 步）：标题、输入校验、归属判断、占位回复。
// 这里不碰数据库也不引 node 依赖，页面、接口、单测都能共用同一份口径。
//
// 红线：一段对话只属于提问的员工本人。canReadConsultation 只认「id 严格相等」，
// 没有任何管理员例外；接口查不到别人的会话时返回 404，不泄露会话是否存在。

export const MAX_RECENT_CONSULTATIONS = 12;
export const MAX_QUESTION_LENGTH = 2000;
export const TITLE_MAX_LENGTH = 28;

/** 第 15 步的占位话术；第 17 段起有 answer 记录时 UI 会改用回答快照渲染。 */
export const PLACEHOLDER_REPLY =
  '收到你的问题了。制度检索与依据核对已接入，本条为占位回复，不作为制度依据。';

export interface QuestionCheck {
  ok: boolean;
  value?: string;
  error?: string;
}

/** 服务端唯一的提问校验出口：不是字符串 / 空白 / 超长一律拒绝 */
export function checkQuestion(raw: unknown): QuestionCheck {
  if (typeof raw !== 'string') return { ok: false, error: '请输入你的问题' };
  const value = raw.trim();
  if (!value) return { ok: false, error: '请输入你的问题' };
  if (value.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: `问题最多 ${MAX_QUESTION_LENGTH} 字，请精简后再发` };
  }
  return { ok: true, value };
}

/** 侧栏「最近咨询」的标题：取第一个问题，压成一行并限长 */
export function consultationTitle(firstQuestion: string): string {
  const flat = firstQuestion.replace(/\s+/g, ' ').trim();
  if (!flat) return '新咨询';
  return flat.length > TITLE_MAX_LENGTH ? `${flat.slice(0, TITLE_MAX_LENGTH)}…` : flat;
}

/** 会话归属：只有本人可读，没有「管理员也能看」的后门 */
export function canReadConsultation(actorId: string, ownerId: string): boolean {
  return !!actorId && actorId === ownerId;
}

/** 侧栏最多展示的会话数（接口与页面都用这个常量） */
export function limitRecentConsultations<T>(rows: T[]): T[] {
  return rows.slice(0, MAX_RECENT_CONSULTATIONS);
}
