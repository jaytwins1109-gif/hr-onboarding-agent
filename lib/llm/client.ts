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

/**
 * 调一次 LLM。按 deepseek → glm 顺序尝试，全失败返回 null（调用方回退静态兜底）。
 * 只服务兜底/闲聊链路，不做多轮上下文（本地工作流的 matched 分支不经这里）。
 */
export async function callLlm(messages: LlmMessage[]): Promise<string | null> {
  for (const cfg of providers()) {
    const text = await callOnce(cfg, messages);
    if (text) return text;
  }
  return null;
}
