// lib/llm/config.ts
//
// 动态模型配置的读取工具：数据库（model_configs 单行 default）是运行时的唯一来源。
// 密钥在库里是 AES-256-GCM 密文，只有这里会把它解成明文并交给请求层。
//
// 红线：
//   1. 解密失败 / 配置缺字段 / 查库异常 → 一律返回 null，由调用方降级本地演示模式，
//      绝不因为配置坏掉就阻断对话（与 client.ts「兜底链路绝不阻断」同一口径）。
//   2. 明文密钥只在 ResolvedLlmConfig 里短暂存在；要打日志请用 describeLlmConfig()。
//   3. 加解密复用 lib/workspace/model-config.ts，避免管理端加密与调用端解密各写一套。

import { prisma } from '@/lib/db';
import { decryptSecret, endpointForChat } from '@/lib/workspace/model-config';

export interface ResolvedLlmConfig {
  /** 完整的 chat/completions 地址 */
  endpoint: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  version: number;
}

/** 库里那一行配置（只取用得到的列，便于注入与单测） */
export interface StoredModelConfig {
  endpoint: string;
  modelName: string;
  encryptedKey: string;
  hasKey: boolean;
  temperature: number;
  maxTokens: number;
  version: number;
}

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 2048;

/**
 * 把库里的一行配置解密成可发起请求的配置。纯函数：不查库、不抛错。
 * 任何字段缺失、密文损坏、AUTH_SECRET 不对，都返回 null（等价于「没有配置」）。
 */
export function decryptModelConfig(
  row: StoredModelConfig | null | undefined,
  secret: string,
): ResolvedLlmConfig | null {
  if (!row) return null;
  if (!row.hasKey || !row.encryptedKey) return null;
  const endpoint = String(row.endpoint ?? '').trim();
  const model = String(row.modelName ?? '').trim();
  if (!endpoint || !model) return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encryptedKey, secret);
  } catch {
    return null;
  }
  if (!apiKey.trim()) return null;

  const temperature = Number.isFinite(row.temperature)
    ? Math.min(1, Math.max(0, row.temperature))
    : DEFAULT_TEMPERATURE;
  const maxTokens = Number.isInteger(row.maxTokens)
    ? Math.min(6000, Math.max(512, row.maxTokens))
    : DEFAULT_MAX_TOKENS;

  return {
    endpoint: endpointForChat(endpoint),
    model,
    apiKey,
    temperature,
    maxTokens,
    version: row.version,
  };
}

/**
 * 读取数据库里的最新配置（单行 default：每次保存都会覆盖并 version +1，
 * 所以读到的就是最新版本）。查库异常同样降级为 null。
 */
export async function loadLlmConfigFromDb(): Promise<ResolvedLlmConfig | null> {
  try {
    const row = await prisma.modelConfig.findUnique({
      where: { id: 'default' },
      select: {
        endpoint: true,
        modelName: true,
        encryptedKey: true,
        hasKey: true,
        temperature: true,
        maxTokens: true,
        version: true,
      },
    });
    return decryptModelConfig(row, process.env.AUTH_SECRET ?? '');
  } catch {
    return null;
  }
}

/** 日志/回包用的脱敏描述，绝不带明文或密文密钥 */
export function describeLlmConfig(cfg: ResolvedLlmConfig): Record<string, string | number> {
  return {
    endpoint: cfg.endpoint,
    model: cfg.model,
    version: cfg.version,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    apiKey: '***',
  };
}
