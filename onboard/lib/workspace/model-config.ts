// lib/workspace/model-config.ts
//
// 模型连接配置（文档第 14 步）：校验、AES-256-GCM 加解密、回包裁剪、错误翻译。
// 只供服务端与单测引用（依赖 node:crypto），浏览器侧不 import 这个文件。
//
// 红线：明文密钥只在保存/测试那一瞬间存在于服务端内存；
// clientConfigFromRow 是唯一对外回包出口，绝不携带 encryptedKey 或明文。

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const KEY_HINT = '已加密保存，留空保留现有凭据';
export const DEFAULT_ENDPOINT = '';
export const DEFAULT_MODEL = '';
export const DEFAULT_TEMPERATURE = 0.3;
export const DEFAULT_MAX_TOKENS = 2048;

export interface ValidatedConfig {
  endpoint: string;
  modelName: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface ValidationResult {
  ok: boolean;
  value?: ValidatedConfig;
  error: string;
}

export interface ClientModelConfig {
  endpoint: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  version: number;
  hasKey: boolean;
  keyHint: string;
  updatedAt: string | null;
}

export interface ModelConfigRow {
  endpoint: string;
  modelName: string;
  encryptedKey: string;
  hasKey: boolean;
  temperature: number;
  maxTokens: number;
  version: number;
  updatedAt: Date;
}

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 16) {
    throw new Error('服务端未配置加密密钥（AUTH_SECRET 至少 16 位）');
  }
  return createHash('sha256').update(secret).digest();
}

/** 返回 iv.tag.ciphertext 的 base64 串；每次加密 iv 都不同，同样的明文也不会得到同样密文 */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decryptSecret(blob: string, secret: string): string {
  const [iv, tag, data] = String(blob).split('.');
  if (!iv || !tag || !data) throw new Error('密钥密文格式不对');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

export function validateModelConfig(
  raw: Record<string, unknown> | null | undefined,
): ValidationResult {
  const endpoint = String(raw?.endpoint ?? '').trim();
  const modelName = String(raw?.modelName ?? '').trim();
  const apiKey = String(raw?.apiKey ?? '').trim();
  if (!endpoint) return { ok: false, error: '请填写接口地址' };
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: '接口地址必须以 http:// 或 https:// 开头' };
    }
  } catch {
    return { ok: false, error: '接口地址格式不对，请检查后重试' };
  }
  if (!modelName) return { ok: false, error: '请填写模型名称' };
  if (modelName.length > 80) return { ok: false, error: '模型名称不超过 80 个字符' };

  const temperature = Number(raw?.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    return { ok: false, error: '回答随机度需在 0 到 1 之间' };
  }
  if (Math.abs(temperature * 10 - Math.round(temperature * 10)) > 1e-9) {
    return { ok: false, error: '回答随机度请按 0.1 的步长填写' };
  }
  const maxTokens = Number(raw?.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 512 || maxTokens > 6000) {
    return { ok: false, error: '单次回答最大长度需是 512 到 6000 之间的整数' };
  }
  return {
    ok: true,
    error: '',
    value: { endpoint, modelName, apiKey, temperature, maxTokens },
  };
}

/** 唯一对外回包出口：不返回密文，更不返回明文，只给一句提示 */
export function clientConfigFromRow(row: ModelConfigRow | null): ClientModelConfig {
  if (!row) {
    return {
      endpoint: DEFAULT_ENDPOINT,
      modelName: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      version: 0,
      hasKey: false,
      keyHint: '',
      updatedAt: null,
    };
  }
  return {
    endpoint: row.endpoint,
    modelName: row.modelName,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    version: row.version,
    hasKey: row.hasKey,
    keyHint: row.hasKey ? KEY_HINT : '',
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 审计文案：只记版本号，绝不出现密钥或密码 */
export function auditDetail(version: number): string {
  return `修改模型配置，保存为版本 v${version}`;
}

export function successMessage(ms: number, units: number): string {
  return `连接成功，用时 ${ms} 毫秒，消耗 ${units} 个计算单位`;
}

/** 把模型服务的失败翻成给管理员看的中文原因 */
export function testFailureMessage(status: number | null, raw: string): string {
  if (status === 401 || status === 403) return '密钥无效或没有访问权限，请检查密钥是否正确';
  if (status === 404) return '模型名不存在或接口地址不对，请检查模型名称与地址';
  if (status === 429) return '模型服务限流了，请稍后再试';
  if (status !== null && status >= 500) return '模型服务暂时不可用，请稍后再试';
  if (status === null) return '连接不上接口地址，请检查地址与网络是否可达';
  const brief = raw.replace(/\s+/g, ' ').slice(0, 80);
  return brief ? `接口返回异常：${brief}` : '接口返回异常，请检查地址、密钥与模型名称';
}

export function endpointForChat(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}
