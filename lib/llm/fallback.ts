// lib/llm/fallback.ts
//
// 兜底拟人化层（2026-11-08 批次10，同日细化情绪分流）。三层设计，从快到慢、从安全到智能：
//
//   1. **本地闲聊分流**（matchChitchat）：纯问候/感谢/问身份 → 引导语；
//      情绪宣泄（烦/累/困/不想上班…）与天气寒暄 → 本地安抚语。
//      纯正则、零网络、零幻觉——这些根本不需要大模型，秒回且不报错。
//      带强业务词的句子（如"不想上班，公积金怎么交"）一律不本地分流，交 LLM 按业务分支处理。
//   2. **LLM 温和兜底**（softenFallback）：知识库未命中 → 交给大模型，Prompt 内先分流：
//      业务咨询 → 保留"建议联系 HR"原意的温和表达；
//      情绪/闲聊 → 共情安抚，绝不提"联系 HR"。
//   3. **静态兜底**（FALLBACK_TEXT）：LLM 无 Key / 失败 / 输出不可信 → 原话术。
//
// 后置闸门（isSoftFallbackTrustworthy）按"用户原话是否含强业务词"分流验收：
//   业务线：回复必须保留"联系 HR"类引导特征——这是防编造的核心防线（没引导 HR 的
//   "业务答案"大概率是编的政策）；非业务线：只要不踩政治/色情黑名单即放行。
// structured_json 模式不经过本文件：那是程序消费的契约，永远严格 FALLBACK_JSON。

import { callLlm } from './client';
import { SYSTEM_PROMPT } from '@/lib/prompts/system-prompt';

/** 纯闲聊句式：整句只是问候/感谢/告别/问身份，允许结尾带标点。防"你好，社保怎么交"误分流 */
const CHITCHAT_RE =
  /^(你好|您好|哈喽|哈罗|嗨|hi|hello|hey|在吗|在么|在不在|早上好|上午好|中午好|下午好|晚上好|晚安|谢谢|多谢|感谢|辛苦了|拜拜|再见|你是谁|你叫什么|你是干嘛的|你能做什么|有什么功能)[!！。~～?？\s]*$/i;

/** 情绪宣泄 / 状态吐槽：本地安抚，不走 LLM（秒回、零幻觉） */
const EMO_RE =
  /烦|累|困|焦虑|紧张|emo|压力|不想上班|不想干活|起不来|睡不着|失眠|头疼|心累|好难|委屈|害怕|担心|崩溃|丧|难受/i;

/** 天气寒暄 */
const WEATHER_RE = /天气|下雨|天晴|好热|好冷|降温|台风|下雪/i;

/**
 * 强业务词：出现即按"业务兜底"标准验收（必须引导 HR），且不再本地分流。
 * 注意"报到"刻意不在表内——"明天要早起报到觉得烦"是情绪，要安抚；
 * 而真正的报到问题会先被 matchFaq 的关键词命中。
 */
const BUSINESS_RE =
  /社保|公积金|五险|薪资|工资|待遇|合同|offer|材料|离职|转正|试用期|考勤|打卡|报销|发票|工伤|体检|背调|档案|户口|绩效|年假|请假|调休|加班费/;

/** 不可放行的内容特征：政治敏感与色情（简单词表，宁枉勿纵） */
const BANNED_RE = /政治|时政|领导人|政府文件|色情|裸聊|约炮|做爱/i;

/** 闲聊引导语：与 constants.ts 的 WELCOME 文案同一口径（"入职材料 / 报到流程 / 找 HR"三件事） */
export const CHITCHAT_REPLY =
  '你好呀～我是小初，公司的新员工入职咨询小助手。入职材料、报到当天流程、遇到问题找谁，都可以直接问我～';

/** 情绪安抚语：先共情、再给"有事随时问我"的出口（口径参考：报到紧张/犯困是常态） */
export const EMO_REPLY =
  '理解理解，刚入职节奏一下子变快，累和烦都特别正常，第一天报到容易紧张犯困也别担心～有什么入职流程不懂的随时问我，我帮你捋～';

/** 天气寒暄接话 */
export const WEATHER_REPLY = '是呀，这天气出门都不容易～有入职相关的问题随时问我哦。';

/** 命中纯闲聊/情绪/天气返回本地拟人回复，否则 null（交 LLM 兜底链） */
export function matchChitchat(message: string): string | null {
  const text = message.trim();
  if (!text || text.length > 25) return null;
  if (CHITCHAT_RE.test(text)) return CHITCHAT_REPLY;
  // 带强业务词的不是纯情绪（"不想上班，公积金怎么交"），交 LLM 按业务分支兜底
  if (BUSINESS_RE.test(text)) return null;
  if (EMO_RE.test(text)) return EMO_REPLY;
  if (WEATHER_RE.test(text)) return WEATHER_REPLY;
  return null;
}

/**
 * LLM 输出后置闸门：按用户原话是否含强业务词分流验收。
 * @param text LLM 的回复
 * @param userMessage 用户原话（用于判定业务/非业务线；缺省按非业务处理）
 */
export function isSoftFallbackTrustworthy(text: string, userMessage = ''): boolean {
  if (!text || text.length > 200) return false;
  if (BANNED_RE.test(text)) return false;
  // 业务线：原话问的是公司事务 → 回复必须保留兜底引导特征，否则视为借机编造政策
  //（比如"社保比例是 X%"这种具体答案，知识库没有就是编的），一律拒收回静态话术。
  if (BUSINESS_RE.test(userMessage)) {
    return /联系|HR|人力|人事|不清楚|不确定|确认/i.test(text);
  }
  // 非业务线（情绪/闲聊/自我介绍）：共情回应不需要提 HR，只要不踩黑名单即放行。
  return true;
}

const SOFTEN_RULES = `【本轮任务】知识库检索未命中，需要你接住用户的这句话。先判断消息类型，再二选一：

A. 业务咨询（问政策/材料/流程/薪资/社保/时间地点等公司事务）——
   1. 保留原意"不清楚，建议联系 HR"：语气可以更温和拟人，但不得弄丢"联系 HR"的引导。
   2. 绝对禁止补充任何事实：不要提比例、金额、日期、地点、联系人等任何具体信息，不要给建议。
B. 情绪宣泄 / 闲聊（吐槽累了烦了、打招呼、自我介绍如"我叫张三多关照"）——
   1. 像朋友一样共情接话、安抚鼓励，做真实的情绪回应。
   2. 绝对不要提"联系 HR""入职""报到"，不要把话题拐回工作问答。
   3. 不编造公司政策，不做任何承诺。

通用要求：最多两句话，80 字以内，纯文本，不带列表/表情/JSON；只输出回复本身。`;

/**
 * LLM 兜底：业务问题 → 温和引导 HR；情绪/闲聊 → 共情回应。
 * 返回 null = 无 Key / 调用失败 / 输出未过后置闸门，调用方应回 FALLBACK_TEXT。
 */
export async function softenFallback(userMessage: string): Promise<string | null> {
  const text = await callLlm([
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${SOFTEN_RULES}` },
    {
      role: 'user',
      content: `知识库没有匹配到这条输入，请按规则接话。用户原话：${userMessage}`,
    },
  ]);
  return text && isSoftFallbackTrustworthy(text, userMessage) ? text : null;
}
