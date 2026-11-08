// lib/llm/fallback.ts
//
// 兜底拟人化层（2026-11-08 批次10）。三层设计，从快到慢、从安全到智能：
//
//   1. **本地闲聊分流**（matchChitchat）：打招呼/感谢/问我是谁 → 固定拟人引导语。
//      纯正则、零网络、零幻觉——闲聊根本不需要大模型。
//   2. **LLM 温和兜底**（softenFallback）：业务性问题但知识库未命中 → 交给大模型
//      按 SYSTEM_PROMPT 的规则用更温和的语气说"建议联系 HR"。
//   3. **静态兜底**（FALLBACK_TEXT）：LLM 无 Key / 失败 / 输出不可信 → 原话术。
//
// 业务问题（社保/薪资/合同……）的红线：无论哪层，**绝不允许编造**——
// LLM 输出要过后置闸门（长度 + 必须保留"联系 HR"原意），不过闸门一律回静态话术。
// structured_json 模式不经过本文件：那是程序消费的契约，永远严格 FALLBACK_JSON。

import { callLlm } from './client';
import { SYSTEM_PROMPT } from '@/lib/prompts/system-prompt';

/** 纯闲聊句式：整句只是问候/感谢/告别/问身份，允许结尾带标点。最长 ~20 字，防"你好，社保怎么交"误分流 */
const CHITCHAT_RE =
  /^(你好|您好|哈喽|哈罗|嗨|hi|hello|hey|在吗|在么|在不在|早上好|上午好|中午好|下午好|晚上好|晚安|谢谢|多谢|感谢|辛苦了|拜拜|再见|你是谁|你叫什么|你是干嘛的|你能做什么|有什么功能)[!！。~～?？\s]*$/i;

/** 闲聊引导语：与 constants.ts 的 WELCOME 文案同一口径（"入职材料 / 报到流程 / 找 HR"三件事） */
export const CHITCHAT_REPLY =
  '你好呀～我是小初，公司的新员工入职咨询小助手。入职材料、报到当天流程、遇到问题找谁，都可以直接问我～';

/** 命中纯闲聊返回引导语，否则 null */
export function matchChitchat(message: string): string | null {
  const text = message.trim();
  if (text.length > 20) return null;
  return CHITCHAT_RE.test(text) ? CHITCHAT_REPLY : null;
}

/** LLM 输出后置闸门：太长 / 弄丢了"联系 HR"原意 → 不可信，回静态兜底 */
export function isSoftFallbackTrustworthy(text: string): boolean {
  if (!text || text.length > 120) return false;
  return /联系|HR|人力|人事/i.test(text);
}

const SOFTEN_RULES = `【本轮任务】知识库检索未命中，需要你做一次"温和兜底"。
硬性要求：
1. 表达必须保留原意"不清楚，建议联系 HR"——可以更温和拟人，但不得弄丢"联系 HR"的引导。
2. 绝对禁止补充任何事实：不要提社保、薪资、流程、时间、地点、联系人等任何具体信息，不要给建议。
3. 最多两句话，60 字以内，纯文本，不带列表/表情/JSON。
4. 只输出改写后的那句话本身。`;

/**
 * LLM 温和兜底：把"不清楚，建议联系 HR。"改写成更拟人的说法。
 * 返回 null = 无 Key / 调用失败 / 输出未过后置闸门，调用方应回 FALLBACK_TEXT。
 */
export async function softenFallback(userMessage: string): Promise<string | null> {
  const text = await callLlm([
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${SOFTEN_RULES}` },
    {
      role: 'user',
      content: `知识库没有匹配到这条提问，请按规则做温和兜底。用户原话：${userMessage}`,
    },
  ]);
  return text && isSoftFallbackTrustworthy(text) ? text : null;
}
