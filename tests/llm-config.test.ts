/**
 * 动态模型配置（lib/llm/config.ts + client.ts）单测。
 *
 * 覆盖两条主线：
 *   1. 解密工具：DB 密文 → 明文 Key / 地址 / 模型 / 随机度；缺字段、坏密文、
 *      错 AUTH_SECRET、查库异常一律安全降级为 null；日志描述绝不带明文。
 *   2. 调用管道：DB 无配置 → [本地演示模式]；DB 有配置 → 解密 → 真的发一次
 *      HTTP 请求（测试内起本地模拟模型服务）→ 拿到真实回复。
 *
 * 测试内用 vi.hoisted 模拟 Prisma 返回「库里那一行加密配置」，但解密、发请求、
 * 收回复都是真做的，完整闭环不依赖外网与真实密钥。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { encryptSecret } from '@/lib/workspace/model-config';
import {
  decryptModelConfig,
  describeLlmConfig,
  loadLlmConfigFromDb,
  type StoredModelConfig,
} from '@/lib/llm/config';
import { callLlm, decideLlmMode } from '@/lib/llm/client';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: { modelConfig: { findUnique: mocks.findUnique } },
}));

const SECRET = 'unit-test-auth-secret-32-chars';
const PLAIN_KEY = 'sk-demo-dynamic-key-123';
const REAL_REPLY = '这是来自模拟模型服务的真实回复';
const DEMO_TAG = '[本地演示模式]';

interface Received {
  auth: string;
  body: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    messages?: unknown[];
  };
}

let server: Server;
let baseEndpoint = '';
let received: Received | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body: Received['body'] = {};
      try {
        body = JSON.parse(raw || '{}') as Received['body'];
      } catch {
        body = {};
      }
      received = { auth: String(req.headers.authorization ?? ''), body };
      if (body.model === 'fail-model') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream down' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: REAL_REPLY } }],
          usage: { total_tokens: 17 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mocks.findUnique.mockReset();
  received = null;
  vi.stubEnv('AUTH_SECRET', SECRET);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeRow(over: Partial<StoredModelConfig> = {}): StoredModelConfig {
  return {
    endpoint: 'https://api.example.com/v1',
    modelName: 'demo-chat',
    encryptedKey: encryptSecret(PLAIN_KEY, SECRET),
    hasKey: true,
    temperature: 0.7,
    maxTokens: 1024,
    version: 3,
    ...over,
  };
}

describe('decryptModelConfig（DB 密文 → 可用配置）', () => {
  it('正确解密，补齐 chat/completions 地址并透传模型参数', () => {
    const cfg = decryptModelConfig(makeRow(), SECRET);
    expect(cfg).not.toBeNull();
    expect(cfg).toMatchObject({
      endpoint: 'https://api.example.com/v1/chat/completions',
      model: 'demo-chat',
      apiKey: PLAIN_KEY,
      temperature: 0.7,
      maxTokens: 1024,
      version: 3,
    });
  });

  it('地址已带 /chat/completions 时不重复拼接', () => {
    const cfg = decryptModelConfig(
      makeRow({ endpoint: 'https://api.example.com/v1/chat/completions' }),
      SECRET,
    );
    expect(cfg?.endpoint).toBe('https://api.example.com/v1/chat/completions');
  });

  it('缺行 / 无凭据标记 / 空密文 / 空地址 / 空模型名 → 一律 null', () => {
    expect(decryptModelConfig(null, SECRET)).toBeNull();
    expect(decryptModelConfig(undefined, SECRET)).toBeNull();
    expect(decryptModelConfig(makeRow({ hasKey: false }), SECRET)).toBeNull();
    expect(decryptModelConfig(makeRow({ encryptedKey: '' }), SECRET)).toBeNull();
    expect(decryptModelConfig(makeRow({ endpoint: '' }), SECRET)).toBeNull();
    expect(decryptModelConfig(makeRow({ modelName: '  ' }), SECRET)).toBeNull();
  });

  it('AUTH_SECRET 不对 / 密文损坏 → null，绝不抛错', () => {
    expect(decryptModelConfig(makeRow(), 'another-secret-32-chars-long')).toBeNull();
    expect(decryptModelConfig(makeRow({ encryptedKey: 'broken.blob' }), SECRET)).toBeNull();
    expect(decryptModelConfig(makeRow(), '')).toBeNull();
  });

  it('库里参数越界时收敛到合法区间', () => {
    const cfg = decryptModelConfig(makeRow({ temperature: 9, maxTokens: 1 }), SECRET);
    expect(cfg?.temperature).toBe(1);
    expect(cfg?.maxTokens).toBe(512);
  });
});

describe('loadLlmConfigFromDb（读库 + 解密 + 安全降级）', () => {
  it('读到加密行 → 解密成完整配置', async () => {
    mocks.findUnique.mockResolvedValue(makeRow());
    const cfg = await loadLlmConfigFromDb();
    expect(cfg?.apiKey).toBe(PLAIN_KEY);
    expect(cfg?.version).toBe(3);
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'default' } }),
    );
  });

  it('没有配置行 → null', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await loadLlmConfigFromDb()).toBeNull();
  });

  it('查库异常 / AUTH_SECRET 缺失 → null，不抛错', async () => {
    mocks.findUnique.mockRejectedValue(new Error('db down'));
    expect(await loadLlmConfigFromDb()).toBeNull();
    mocks.findUnique.mockResolvedValue(makeRow());
    vi.stubEnv('AUTH_SECRET', '');
    expect(await loadLlmConfigFromDb()).toBeNull();
  });

  it('日志描述脱敏，绝不带明文或密文', () => {
    const cfg = decryptModelConfig(makeRow(), SECRET);
    expect(cfg).not.toBeNull();
    const text = JSON.stringify(describeLlmConfig(cfg!));
    expect(text).not.toContain(PLAIN_KEY);
    expect(text).toContain('***');
  });
});

describe('decideLlmMode（配置 → 调用模式）', () => {
  it('有配置走线上；无配置非测试态走 Mock，测试态保持旧契约 null', () => {
    expect(decideLlmMode(decryptModelConfig(makeRow(), SECRET), 'test').kind).toBe('live');
    expect(decideLlmMode(null, 'development').kind).toBe('mock');
    expect(decideLlmMode(null, 'production').kind).toBe('mock');
    expect(decideLlmMode(null, 'test').kind).toBe('test-null');
  });
});

describe('callLlm（无配置自动降级）', () => {
  it('DB 无配置 → [本地演示模式]，且零网络调用', async () => {
    const fetchSpy = vi.fn();
    const reply = await callLlm([{ role: 'user', content: '公积金的缴纳比例是多少' }], {
      config: null,
      env: 'development',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    expect(reply).toContain(DEMO_TAG);
    expect(reply).toContain('联系 HR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('配置加载器抛异常 → 同样降级，不阻断对话', async () => {
    const reply = await callLlm([{ role: 'user', content: '你好' }], {
      loadConfig: async () => {
        throw new Error('config service down');
      },
      env: 'development',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(reply).toContain(DEMO_TAG);
  });

  it('vitest 旧契约：无配置且无 stub Key → 返回 null（静态兜底）', async () => {
    const reply = await callLlm([{ role: 'user', content: '社保怎么交' }], {
      config: null,
      env: 'test',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(reply).toBeNull();
  });
});

describe('完整闭环：DB 加密配置 → 解密 → 真实 HTTP 请求 → 真实回复', () => {
  it('请求头带解密后的明文 Key，请求体带模型名/随机度/最大长度，拿回模型输出', async () => {
    mocks.findUnique.mockResolvedValue(
      makeRow({ endpoint: baseEndpoint, temperature: 0.7, maxTokens: 1024 }),
    );
    const reply = await callLlm(
      [
        { role: 'system', content: '你是入职咨询助手' },
        { role: 'user', content: '社保缴费比例是多少' },
      ],
      { env: 'test', loadConfig: () => loadLlmConfigFromDb() },
    );

    expect(reply).toBe(REAL_REPLY);
    expect(reply).not.toContain(DEMO_TAG);
    expect(received?.auth).toBe(`Bearer ${PLAIN_KEY}`);
    expect(received?.body.model).toBe('demo-chat');
    expect(received?.body.temperature).toBe(0.7);
    expect(received?.body.max_tokens).toBe(1024);
    expect(received?.body.messages).toHaveLength(2);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it('上游失败 → 返回 null，不抛错（调用方回静态兜底）', async () => {
    mocks.findUnique.mockResolvedValue(
      makeRow({ endpoint: baseEndpoint, modelName: 'fail-model' }),
    );
    const reply = await callLlm([{ role: 'user', content: '社保怎么交' }], {
      env: 'test',
      loadConfig: () => loadLlmConfigFromDb(),
    });
    expect(reply).toBeNull();
  });
});
