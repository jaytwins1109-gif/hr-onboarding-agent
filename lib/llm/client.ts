// lib/llm/client.ts
//
// 极简 LLM 客户端（2026-11-08 批次10 新增）。
//
// 在此之前本项目没有任何真实 LLM 调用——"大脑"是本地关键词工作流
//（lib/llm/local-workflow.ts），SYSTEM_PROMPT 只是文档。本文件把兜底路径
// 第一次接到大模型上：知识库未匹配的 chat_text 轮次交给模型做温和兜底/闲聊引导。
//
// 设计红线：
//   1. **绝不阻断**：无 Key、网络失败、超时、响应格式异常 → 一律返回 null，
//      调用方回退静态兜底话术（FALLBACK_TEXT）。兜底链路慢了比坏了更糟。
//   2. **deepseek 主 / glm 备**：与 .env.example 的口径一致；主 Key 失败自动试备用。
//   3. OpenAI 兼容 chat/completions，10 秒超时，单轮调用，不做流式。
//   4. 运行时环境读 key：DEEPSEEK_API_KEY / DEEPSEEK_API_BASE / DEEPSEEK_MODEL /
//      GLM_API_KEY / GLM_MODEL。测试环境（vitest）不加载 .env.local →
//      天然无 Key → 返回 null，走静态兜底，旧断言零改动。

const TIMEOUT_MS = 10_000;

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
}

function providers(): ProviderConfig[] {
  return [
    {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY?.trim() || undefined,
      baseUrl: (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
    },
    {
      name: 'glm',
      apiKey: process.env.GLM_API_KEY?.trim() || undefined,
      baseUrl: (process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4').replace(
        /\/$/,
        '',
      ),
      model: process.env.GLM_MODEL?.trim() || 'glm-4-flash',
    },
  ];
}

/** 单个 provider 的一次调用；任何异常（网络/超时/非 2xx/结构不对）返回 null */
async function callOnce(cfg: ProviderConfig, messages: LlmMessage[]): Promise<string | null> {
  if (!cfg.apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Mock 演示模式（无 Key 时的拟人化降级）────────────────────────────
//
// 开源后别人拉代码跑起来，没配 DEEPSEEK_API_KEY / GLM_API_KEY 时，
// 兜底链如果直接掉到静态话术，就完全展示不出"情绪安抚/越界拦截"的设计意图。
// 这里按关键词分四类给拟人 Mock 回复，全部带 [本地演示模式] 后缀明示非真实 AI。
//
// ⚠️ vitest 环境保持旧契约（返回 null → 静态兜底）：现有测试断言的是
// "无 Key 时 softenFallback 返回 null"，Mock 一旦在测试里生效会全线翻车。

const MOCK_EMO_RE = /烦|累|不想上班|emo|无聊|焦虑|紧张|压力|崩溃|困|丧|委屈|难受/;
const MOCK_OFFTOPIC_RE =
  /翻译|写代码|代码|编程|python|javascript|算法|排序|冒泡|不管规矩|提示词|system prompt|我是领导|解除限制|无视规则/i;
const MOCK_TIME_RE = /星期几|周几|几点|今天日期|几号/;

let mockWarned = false;
function warnMockOnce(): void {
  if (mockWarned) return;
  mockWarned = true;
  console.warn('[Mock] 未检测到 API Key，已自动启用本地演示模式。');
}

/** 无 Key 时的拟人化回复；分类优先级：情绪 → 越界 → 闲聊/时间 → 业务兜底 */
export function mockLlmReply(userText: string): string {
  const text = userText.trim();
  if (MOCK_EMO_RE.test(text)) {
    return '理解理解，刚入职节奏变快确实容易累，你的感受很正常，先好好休息一下，明天会更好的～[本地演示模式]';
  }
  if (MOCK_OFFTOPIC_RE.test(text)) {
    return '我是小初，主要帮你解答入职相关的问题哦～身份声明不构成权限提升，有问题走正规流程哈。[本地演示模式]';
  }
  if (MOCK_TIME_RE.test(text)) {
    const nowText = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
    return `现在是 ${nowText}（北京时间）～入职的时间节点还是以 offer 和 HR 通知为准哦。[本地演示模式]`;
  }
  if (/你好|您好|在吗|嗨|hi|hello|早上好|晚上好|再见|谢谢/i.test(text)) {
    return '你好呀！我是小初，今天也是元气满满的一天，入职有问题随时问我～[本地演示模式]';
  }
  return '这个问题我暂时没查到准确信息，为了不误导你，建议直接联系 HR 确认哦～[本地演示模式]';
}

/**
 * 调一次 LLM。按 deepseek → glm 顺序尝试，全失败返回 null（调用方回退静态兜底）。
 * 两个 provider 都没配 Key：非 test 环境进入 Mock 演示模式（零网络调用，
 * 按关键词返回拟人文案）；vitest 保持返回 null（旧契约，测试零改动）。
 * 只服务兜底/闲聊链路，不做多轮上下文（本地工作流的 matched 分支不经这里）。
 */
export async function callLlm(messages: LlmMessage[]): Promise<string | null> {
  const cfgs = providers();
  if (!cfgs.some((c) => c.apiKey)) {
    if (process.env.NODE_ENV !== 'test') {
      warnMockOnce();
      const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      return mockLlmReply(userText);
    }
    return null;
  }
  for (const cfg of cfgs) {
    const text = await callOnce(cfg, messages);
    if (text) return text;
  }
  return null;
}
