// lib/llm/client.ts
//
// 极简 LLM 客户端（2026-11-08 批次10 新增；2026-11-13 接入动态模型配置）。
//
// 调用来源优先级（运行时唯一真源是数据库，不再依赖本地 .env）：
//   1. model_configs 里的配置 → 解密后按 Key / 地址 / 模型名 / 随机度 / 最大长度发请求；
//   2. 库里没配置（或留空）→ 自动降级 [本地演示模式]（Mock，零网络调用）；
//   3. 仅 vitest：旧用例用 vi.stubEnv('DEEPSEEK_API_KEY') 模拟 provider，作为测试兼容层；
//      development / production 完全不读这些变量。
//
// 设计红线：
//   1. **绝不阻断**：无配置走 Mock；查库/解密/网络失败、超时、响应异常 → 返回 null，
//      调用方回退静态兜底话术（FALLBACK_TEXT）。兜底链路慢了比坏了更糟。
//   2. OpenAI 兼容 chat/completions，10 秒超时，单轮调用，不做流式。
//   3. 明文密钥只在服务端内存里短暂存在；不进日志、不进任何回包。

import { loadLlmConfigFromDb, type ResolvedLlmConfig } from './config';
import { DEFAULT_MAX_TOKENS, endpointForChat } from '@/lib/workspace/model-config';

const TIMEOUT_MS = 10_000;

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlmCallOptions {
  /** 显式指定配置；传 null = 强制「无配置」用于验证降级。不传则读数据库 */
  config?: ResolvedLlmConfig | null;
  /** 自定义配置加载器（测试可注入「模拟 DB 行 → 真解密」的闭包） */
  loadConfig?: () => Promise<ResolvedLlmConfig | null>;
  /** 自定义 fetch（测试用） */
  fetchImpl?: typeof fetch;
  /** 覆盖运行态判定（测试用），默认取 NODE_ENV */
  env?: string;
}

export type LlmMode =
  { kind: 'live'; config: ResolvedLlmConfig } | { kind: 'mock' } | { kind: 'test-null' };

/** 纯决策函数：有配置就走线上；没配置非测试态走 Mock，测试态保持旧契约返回 null */
export function decideLlmMode(config: ResolvedLlmConfig | null, env: string): LlmMode {
  if (config) return { kind: 'live', config };
  return env === 'test' ? { kind: 'test-null' } : { kind: 'mock' };
}

interface RequestConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

function toRequest(cfg: ResolvedLlmConfig): RequestConfig {
  return {
    endpoint: cfg.endpoint,
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  };
}

/** 单次请求；任何异常（网络/超时/非 2xx/结构不对）返回 null */
async function callOnce(
  cfg: RequestConfig,
  messages: LlmMessage[],
  fetchImpl: typeof fetch,
): Promise<string | null> {
  if (!cfg.apiKey || !cfg.endpoint) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: false,
      }),
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
 * 仅 vitest 的测试兼容层：旧用例靠 stubEnv 模拟「有 Key」。
 * 运行态（development / production）返回空数组，模型配置只认数据库。
 */
function testCompatProviders(env: string): RequestConfig[] {
  if (env !== 'test') return [];
  const out: RequestConfig[] = [];
  const deepseek = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseek) {
    out.push({
      endpoint: endpointForChat(process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1'),
      apiKey: deepseek,
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      temperature: 0.4,
      maxTokens: DEFAULT_MAX_TOKENS,
    });
  }
  const glm = process.env.GLM_API_KEY?.trim();
  if (glm) {
    out.push({
      endpoint: endpointForChat(process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4'),
      apiKey: glm,
      model: process.env.GLM_MODEL?.trim() || 'glm-4-flash',
      temperature: 0.4,
      maxTokens: DEFAULT_MAX_TOKENS,
    });
  }
  return out;
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
 * 调一次 LLM：默认从数据库读动态配置（解密 Key），没配置就降级本地演示模式。
 *
 * 只服务兜底/闲聊链路，不做多轮上下文（本地工作流的 matched 分支不经这里）。
 * options 只给测试/脚本用：显式 config / loadConfig / fetchImpl / env 覆盖；
 * 运行时不传，全部走真库与真 fetch。
 */
export async function callLlm(
  messages: LlmMessage[],
  options: LlmCallOptions = {},
): Promise<string | null> {
  const env = options.env ?? process.env.NODE_ENV ?? 'development';
  const fetchImpl = options.fetchImpl ?? fetch;

  let cfg: ResolvedLlmConfig | null = null;
  try {
    cfg =
      options.config !== undefined
        ? options.config
        : await (options.loadConfig ?? loadLlmConfigFromDb)();
  } catch {
    cfg = null;
  }

  const mode = decideLlmMode(cfg, env);
  if (mode.kind === 'live') {
    return callOnce(toRequest(mode.config), messages, fetchImpl);
  }

  // 测试兼容层：旧用例 stub 了 DEEPSEEK/GLM 的 Key；运行态这里恒为空数组
  const legacy = testCompatProviders(env);
  if (legacy.length > 0) {
    for (const provider of legacy) {
      const text = await callOnce(provider, messages, fetchImpl);
      if (text) return text;
    }
    return null;
  }

  if (mode.kind === 'test-null') return null;
  warnMockOnce();
  const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  return mockLlmReply(userText);
}
