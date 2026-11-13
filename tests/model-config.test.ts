/**
 * 模型配置单测（文档第 14 步）：密钥加密往返、回包绝不泄露凭据、
 * 参数校验、版本与审计文案不含密钥、测试失败原因中文分类。
 */
import { describe, expect, it } from 'vitest';
import { canConfigureModel } from '@/lib/workspace/access';
import {
  auditDetail,
  clientConfigFromRow,
  decryptSecret,
  encryptSecret,
  endpointForChat,
  KEY_HINT,
  successMessage,
  testFailureMessage,
  validateModelConfig,
  type ModelConfigRow,
} from '@/lib/workspace/model-config';

const SECRET = 'unit-test-secret-32-characters-long';
const PLAIN = 'sk-demo-1234567890abcdef';

const valid = (over: Record<string, unknown> = {}) => ({
  endpoint: 'https://api.example.com/v1',
  modelName: 'example-chat',
  apiKey: PLAIN,
  temperature: 0.3,
  maxTokens: 2048,
  ...over,
});

const row = (over: Partial<ModelConfigRow> = {}): ModelConfigRow => ({
  endpoint: 'https://api.example.com/v1',
  modelName: 'example-chat',
  encryptedKey: encryptSecret(PLAIN, SECRET),
  hasKey: true,
  temperature: 0.3,
  maxTokens: 2048,
  version: 2,
  updatedAt: new Date('2026-11-13T00:00:00Z'),
  ...over,
});

describe('密钥加密与不回传', () => {
  it('加解密往返一致，且同样的明文每次密文都不同', () => {
    const blob = encryptSecret(PLAIN, SECRET);
    expect(decryptSecret(blob, SECRET)).toBe(PLAIN);
    expect(encryptSecret(PLAIN, SECRET)).not.toBe(blob);
  });

  it('换密钥、换密文格式都无法解密', () => {
    const blob = encryptSecret(PLAIN, SECRET);
    expect(() => decryptSecret(blob, 'another-secret-32-characters-long')).toThrow();
    expect(() => decryptSecret('not-a-valid-blob', SECRET)).toThrow('密钥密文格式不对');
  });

  it('服务端密钥过短时拒绝加密', () => {
    expect(() => encryptSecret(PLAIN, 'short')).toThrow(/AUTH_SECRET/);
  });

  it('对外回包只有提示语，不含密文字段或明文', () => {
    const config = clientConfigFromRow(row());
    expect(config.keyHint).toBe(KEY_HINT);
    expect(config.hasKey).toBe(true);
    expect(Object.keys(config)).not.toContain('encryptedKey');
    expect(JSON.stringify(config)).not.toContain(PLAIN);
    expect(JSON.stringify(config)).not.toContain('encrypt');
  });

  it('尚未配置时给出默认值与版本 0', () => {
    const config = clientConfigFromRow(null);
    expect(config).toMatchObject({
      version: 0,
      hasKey: false,
      keyHint: '',
      updatedAt: null,
      temperature: 0.3,
      maxTokens: 2048,
    });
  });

  it('审计文案只记版本号，不含密钥或密码字样', () => {
    expect(auditDetail(3)).toContain('v3');
    expect(auditDetail(3)).not.toContain(PLAIN);
    expect(auditDetail(3)).not.toContain('密钥');
  });
});

describe('配置参数校验', () => {
  it('合法配置通过（含 temperature=0 与两端边界）', () => {
    expect(validateModelConfig(valid()).ok).toBe(true);
    expect(validateModelConfig(valid({ temperature: 0 })).ok).toBe(true);
    expect(validateModelConfig(valid({ temperature: 1, maxTokens: 512 })).ok).toBe(true);
    expect(validateModelConfig(valid({ maxTokens: 6000, apiKey: '' })).ok).toBe(true);
  });

  it('地址、模型名、随机度、最大长度的异常都给中文原因', () => {
    expect(validateModelConfig(valid({ endpoint: '' })).error).toBe('请填写接口地址');
    expect(validateModelConfig(valid({ endpoint: 'not-a-url' })).error).toContain('格式不对');
    expect(validateModelConfig(valid({ endpoint: 'ftp://x.com' })).error).toContain('http');
    expect(validateModelConfig(valid({ modelName: '' })).error).toBe('请填写模型名称');
    expect(validateModelConfig(valid({ temperature: 1.2 })).error).toContain('0 到 1');
    expect(validateModelConfig(valid({ temperature: 0.25 })).error).toContain('0.1');
    expect(validateModelConfig(valid({ maxTokens: 511 })).error).toContain('512 到 6000');
    expect(validateModelConfig(valid({ maxTokens: 6001 })).error).toContain('512 到 6000');
    expect(validateModelConfig(valid({ maxTokens: 1024.5 })).error).toContain('整数');
    expect(validateModelConfig({}).ok).toBe(false);
  });
});

describe('测试连接的话术', () => {
  it('成功话术带耗时与计算单位', () => {
    expect(successMessage(128, 42)).toBe('连接成功，用时 128 毫秒，消耗 42 个计算单位');
  });

  it('失败按地址 / 密钥 / 模型名给中文原因', () => {
    expect(testFailureMessage(401, 'Unauthorized')).toContain('密钥无效');
    expect(testFailureMessage(403, 'Forbidden')).toContain('密钥无效');
    expect(testFailureMessage(404, 'model not found')).toContain('模型名不存在');
    expect(testFailureMessage(429, 'rate limit')).toContain('限流');
    expect(testFailureMessage(500, 'oops')).toContain('暂时不可用');
    expect(testFailureMessage(null, '')).toContain('连接不上接口地址');
    expect(testFailureMessage(400, 'bad request')).toContain('接口返回异常');
  });

  it('接口地址自动补 /chat/completions，且不会重复补', () => {
    expect(endpointForChat('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(endpointForChat('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(endpointForChat('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });
});

describe('模型配置权限', () => {
  it('只有系统管理员能进入', () => {
    expect(canConfigureModel('DEVELOPER')).toBe(true);
    expect(canConfigureModel('ADMIN')).toBe(false);
    expect(canConfigureModel('PRODUCT_OPS')).toBe(false);
    expect(canConfigureModel('USER')).toBe(false);
    expect(canConfigureModel('乱写的角色')).toBe(false);
  });
});
