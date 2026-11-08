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
// 后置闸门（isSoftFallbackTrustworthy）按"用户原话意图"分流验收：
//   词汇解释线：原话含英文词 + 公司文件语境（问 HR 材料里的生词）→ 直接解释即放行，
//   不要求"联系 HR"（SYSTEM_PROMPT 二·六第 2 条：业务辅助必须热心解答）；
//   业务线：原话问公司事务 → 回复必须保留"联系 HR"类引导特征——这是防编造的核心防线；
//   非业务线：只要不踩政治/色情黑名单即放行。
// structured_json 模式不经过本文件：那是程序消费的契约，永远严格 FALLBACK_JSON。

import { callLlm } from './client';
import { buildLiveSystemPrompt } from '@/lib/prompts/system-prompt';

/** 纯闲聊句式：整句只是问候/感谢/告别/问身份，允许结尾带标点。防"你好，社保怎么交"误分流 */
const CHITCHAT_RE =
  /^(你好|您好|哈喽|哈罗|嗨|hi|hello|hey|在吗|在么|在不在|早上好|上午好|中午好|下午好|晚上好|晚安|谢谢|多谢|感谢|辛苦了|拜拜|再见|你是谁|你叫什么|你是干嘛的|你能做什么|有什么功能)[!！。~～?？\s]*$/i;

/**
 * 跨领域越界请求（翻译/写代码/写诗/常识问答）：本地直接拒绝，不浪费 Token。
 * 特征词刻意避开"计算"这类业务语境词（"年假怎么计算"是业务问题，要引导 HR，
 * 不能误拦成越界拒绝）。
 * 业务语境豁免：含 BIZ_CONTEXT_RE 的句子是"问公司文件里的词"（业务辅助），
 * 不本地拦截，放行走 LLM 解释分支。
 */
const OFFTOPIC_RE =
  /翻译|translate|翻成|译成|用英文说|英文怎么说|写代码|一段代码|代码|编程|python|javascript|typescript|golang|java\b|算法|冒泡|快排|排序算法|写诗|作诗|写首|写文章|写作文|写小说|写故事|解方程|微积分|物理题|化学题/i;

/** 业务语境词：出现即视为"问公司文件/材料里的内容"，越界拦截对其豁免 */
const BIZ_CONTEXT_RE =
  /入职|材料|合同|制度|手册|员工手册|offer|条款|文件|协议|通知|邮件|背调|试用期通知/i;

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

/**
 * 日期/星期/时间问句：本地直接用系统时钟回答——比 LLM 更准更稳（LLM 没有时间概念，
 * 就算注入了上下文也可能飘），零延迟零幻觉。
 * 事件日期（入职那天是星期几/放假安排）不算——那是业务问题，交 LLM 业务分支。
 */
const DATE_RE = /星期几|周几|礼拜几|今天.{0,6}(几号|日期|日子)|现在几点|今天是什么(时候|日子)/i;

/** 问日期时排除的事件词：命中说明问的是某个事件对应的日期，不是"现在" */
const DATE_EVENT_RE = /入职|报到|面试|offer|放假|节假日|发薪|发工资|工资日/i;

/** 系统时间回复（Asia/Shanghai，每次实时生成） */
export function nowReply(): string {
  const nowText = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  return `今天是${nowText}哦～时间以你手机为准最靠谱。我能帮您解答入职流程、材料上的问题，随时问我～`;
}

/** 角色边界拒绝语（越界请求统一话术，与 SYSTEM_PROMPT 的【角色边界禁令】同一口径） */
export const OFFTOPIC_REPLY =
  '我是小初，主要帮你解答入职相关的问题哦～遇到材料、流程等难题，随时问我。';

/** 命中纯闲聊/越界/情绪/天气返回本地拟人回复，否则 null（交 LLM 兜底链） */
export function matchChitchat(message: string): string | null {
  const text = message.trim();
  if (!text || text.length > 40) return null;
  if (CHITCHAT_RE.test(text)) return CHITCHAT_REPLY;
  // 越界请求（翻译/写代码/写诗…）优先于业务词判定；但带业务语境的豁免——
  // "入职通知里的 certificate 是什么意思"是业务辅助，放行走 LLM 解释分支。
  if (OFFTOPIC_RE.test(text) && !BIZ_CONTEXT_RE.test(text)) return OFFTOPIC_REPLY;
  // 日期/星期/时间问答：本地系统时钟直接回答（"今天是星期几""你不知道今天是星期几吗"
  // 都在这层收口，绝不触发越界拒答或"联系 HR"兜底）。事件日期除外。
  if (DATE_RE.test(text) && !DATE_EVENT_RE.test(text)) return nowReply();
  // 带强业务词的不是纯情绪（"不想上班，公积金怎么交"），交 LLM 按业务分支兜底
  if (BUSINESS_RE.test(text)) return null;
  if (EMO_RE.test(text)) return EMO_REPLY;
  if (WEATHER_RE.test(text)) return WEATHER_REPLY;
  return null;
}

/**
 * 业务词汇解释线：原话含英文词 + 公司文件/材料语境 → 用户在问 HR 材料里的生词，
 * LLM 的职责是直接解释（SYSTEM_PROMPT 二·六第 2 条），回复不需要"联系 HR"引导。
 * 导出版供 local-workflow 在 FAQ 匹配**之前**判定——否则"材料里的 certificate
 * 是什么意思"会被"材料"关键词带偏成材料清单，答非所问。
 */
export function isBizTermExplain(userMessage: string): boolean {
  return /[a-z]{2,}/i.test(userMessage) && BIZ_CONTEXT_RE.test(userMessage);
}

/**
 * LLM 输出后置闸门：按用户原话的意图分流验收。
 * @param text LLM 的回复
 * @param userMessage 用户原话（用于判定业务/解释/非业务线；缺省按非业务处理）
 */
export function isSoftFallbackTrustworthy(text: string, userMessage = ''): boolean {
  if (!text || text.length > 200) return false;
  if (BANNED_RE.test(text)) return false;
  // 时间线：原话问当前日期/星期/时间 → 用注入的时间回答即放行（本地层没接住的漏网），
  // 不要求"联系 HR"特征——"今天是星期四"没有 HR 也是正确回答。
  if (DATE_RE.test(userMessage) && !DATE_EVENT_RE.test(userMessage)) return true;
  // 解释线（优先于业务线）：问公司文件里的英文词 → 直接解释即放行，
  // 不要求"联系 HR"特征——否则"certificate 是学历证明"会被误杀回兜底。
  if (isBizTermExplain(userMessage)) return true;
  // 业务线：原话问的是公司事务 → 回复必须保留兜底引导特征，否则视为借机编造政策
  //（比如"社保比例是 X%"这种具体答案，知识库没有就是编的），一律拒收回静态话术。
  if (BUSINESS_RE.test(userMessage)) {
    return /联系|HR|人力|人事|不清楚|不确定|确认/i.test(text);
  }
  // 非业务线（情绪/闲聊/自我介绍）：共情回应不需要提 HR，只要不踩黑名单即放行。
  return true;
}

const SOFTEN_RULES = `【本轮任务】知识库检索未命中，需要你接住用户的这句话。先判断消息类型，再四选一：

A. 业务咨询（问政策/材料/流程/薪资/社保/时间地点等公司事务）——
   1. 保留原意"不清楚，建议联系 HR"：语气可以更温和拟人，但不得弄丢"联系 HR"的引导。
   2. 绝对禁止补充任何事实：不要提比例、金额、日期、地点、联系人等任何具体信息，不要给建议。
B. 情绪宣泄 / 闲聊（吐槽累了烦了、打招呼、自我介绍如"我叫张三多关照"）——
   1. 像朋友一样共情接话、安抚鼓励，做真实的情绪回应。
   2. 绝对不要提"联系 HR""入职""报到"，不要把话题拐回工作问答。
   3. 不编造公司政策，不做任何承诺。
C. 跨领域越界请求（纯翻译外语、写代码、写诗写文章、常识百科等，与公司业务无关）——
   一律不执行，统一回复："我是小初，主要帮你解答入职相关的问题哦～遇到材料、流程等难题，随时问我。"
   绝对不要给出任何翻译结果、代码或百科答案，也不要提"联系 HR"。
D. 业务词汇解释（问入职材料/合同/制度/员工手册/Offer 等公司文件中出现的英文词）——
   这是业务辅助，必须热心解答：直接给出该词在 HR/法律场景下准确、通俗的中文解释，
   可补充一句"具体以公司文件为准"；不要提"联系 HR"，不要拒答；
   不得编造公司-specific 的条款内容，只解释词汇本身的通用含义。
E. 日期/星期/时间询问（今天是星期几、现在几点等）——
   用系统提示词头部注入的时间直接回答，不要说不知道，不要引导找 HR；
   不要推测节假日、发薪日等其他日期安排。
F. 用户质疑你的能力（"你连这个都不知道""你怎么帮我处理"）——
   温和解释自己的边界，不甩锅、不摆烂：如"我能帮您解答入职流程和材料上的问题，
   具体时间以您手机为准最靠谱哦～"，顺势引导回入职话题。绝不引导找 HR。

通用要求：最多两句话，80 字以内，纯文本，不带列表/表情/JSON；只输出回复本身。`;

/**
 * LLM 兜底：业务问题 → 温和引导 HR；情绪/闲聊 → 共情回应；时间/质疑 → 见 E/F。
 * 返回 null = 无 Key / 调用失败 / 输出未过后置闸门，调用方应回 FALLBACK_TEXT。
 */
export async function softenFallback(userMessage: string): Promise<string | null> {
  const text = await callLlm([
    { role: 'system', content: `${buildLiveSystemPrompt()}\n\n${SOFTEN_RULES}` },
    {
      role: 'user',
      content: `知识库没有匹配到这条输入，请按规则接话。用户原话：${userMessage}`,
    },
  ]);
  return text && isSoftFallbackTrustworthy(text, userMessage) ? text : null;
}
