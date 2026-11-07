// lib/chat/handlers.ts
//
// 2026-11-07 底层换血：旧业务价格过滤、打分、推荐、加购、记忆抽取等 handler 全部移除。
// 现在只保留两个入口，内部都走 runLocalWorkflow（检索 + 权限守卫 + FAQ 匹配）：
//   - 聊天入口 runChatTurn：纯文本模式，返回字符串，不做任何 JSON 包装；
//   - 结构化入口 runStructuredTurn：返回严格 JSON 对象（由上层序列化，
//     handler 不加 Markdown 代码块）。
//
// 红线：
//   - 不输出知识库内部字段、软删除记录、越权记录；
//   - 兜底话术严格为 FALLBACK_TEXT（“不清楚，建议联系 HR。”）。

import {
  FALLBACK_JSON,
  FALLBACK_TEXT,
  runLocalWorkflow,
  type LocalWorkflowInput,
  type LocalWorkflowResult,
} from '@/lib/llm/local-workflow';

export { FALLBACK_TEXT, FALLBACK_JSON };

export type OutputMode = LocalWorkflowInput['outputMode'];

export interface TurnInput {
  message: string;
  /** 当前用户角色：new_hire | employee（权限只认系统传入的上下文） */
  userRole: string;
  outputMode: OutputMode;
}

export interface TurnResult {
  /** 聊天模式 = 纯文本；结构化模式 = 严格 JSON 对象 */
  result: LocalWorkflowResult;
  outputMode: OutputMode;
}

/** 聊天入口：返回纯文本 */
export async function runChatTurn(input: Omit<TurnInput, 'outputMode'>): Promise<string> {
  const result = await runLocalWorkflow({ ...input, outputMode: 'chat_text' });
  return typeof result === 'string' ? result : result.answer;
}

/** 结构化入口：返回严格 JSON 对象（不序列化、不加代码块） */
export async function runStructuredTurn(
  input: Omit<TurnInput, 'outputMode'>,
): Promise<Exclude<LocalWorkflowResult, string>> {
  const result = await runLocalWorkflow({ ...input, outputMode: 'structured_json' });
  return typeof result === 'string'
    ? FALLBACK_JSON
    : (result as Exclude<LocalWorkflowResult, string>);
}

/** 统一入口：按 outputMode 分流 */
export async function handleTurn(input: TurnInput): Promise<TurnResult> {
  const result = await runLocalWorkflow(input);
  return { result, outputMode: input.outputMode };
}
