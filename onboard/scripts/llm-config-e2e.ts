// scripts/llm-config-e2e.ts
//
// 动态模型配置的端到端闭环脚本（不依赖 vitest mock）：
//   真库写入一条 AES-256-GCM 加密配置 → callLlm 读库解密 → 真的发 HTTP 请求到
//   本地模拟模型服务 → 拿回真实回复；再走 softenFallback / runLocalWorkflow 验证
//   业务兜底链已经接上动态配置；最后删掉配置验证自动降级 [本地演示模式]。
//
// 跑法（--env-file 必须在模块加载前生效，所以放在命令行而不是脚本里）：
//   node --env-file=.env --env-file=.env.local \
//        --import ./scripts/ts-alias-register.mjs scripts/llm-config-e2e.ts
//
// 脚本会先备份库里原有的模型配置，跑完原样恢复，绝不留下示例密钥。

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/workspace/model-config';
import { callLlm } from '@/lib/llm/client';
import { softenFallback } from '@/lib/llm/fallback';
import { runLocalWorkflow } from '@/lib/llm/local-workflow';

const PLAIN_KEY = 'sk-e2e-local-only-key';
const REAL_REPLY = '这个问题我也不太确定，为了不误导你，建议直接联系 HR 确认哦～';
const QUESTION = '社保缴费比例是多少呀';

let failures = 0;
function check(ok: boolean, label: string, extra = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
}

interface Received {
  auth: string;
  body: { model?: string; temperature?: number; max_tokens?: number };
}

async function main(): Promise<void> {
  const secret = process.env.AUTH_SECRET ?? '';
  check(secret.length >= 16, 'AUTH_SECRET 已就绪（用于解密库里的密钥）');
  if (secret.length < 16) throw new Error('缺少 AUTH_SECRET，无法验证解密链路');

  const original = await prisma.modelConfig.findUnique({ where: { id: 'default' } });
  const backup = original
    ? {
        endpoint: original.endpoint,
        modelName: original.modelName,
        encryptedKey: original.encryptedKey,
        hasKey: original.hasKey,
        temperature: original.temperature,
        maxTokens: original.maxTokens,
        version: original.version,
        updatedById: original.updatedById,
      }
    : null;

  let received: Received | null = null;
  // 赋值发生在 HTTP 回调里，TS 的控制流分析不会跨回调追踪（会把模块级 let 窄化成 never）。
  // 用显式返回类型的 getter 读取，避免类型断言遮掉真实的空值情况。
  const lastReceived = (): Received | null => received;
  const server = createServer((req, res) => {
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
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: REAL_REPLY } }],
          usage: { total_tokens: 23 },
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  try {
    console.log('== 1. 写入真库的一条加密配置 ==');
    await prisma.modelConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        endpoint,
        modelName: 'e2e-chat',
        encryptedKey: encryptSecret(PLAIN_KEY, secret),
        hasKey: true,
        temperature: 0.6,
        maxTokens: 900,
        version: 99,
      },
      update: {
        endpoint,
        modelName: 'e2e-chat',
        encryptedKey: encryptSecret(PLAIN_KEY, secret),
        hasKey: true,
        temperature: 0.6,
        maxTokens: 900,
        version: 99,
      },
    });
    const stored = await prisma.modelConfig.findUnique({ where: { id: 'default' } });
    check(
      !!stored && stored.encryptedKey !== PLAIN_KEY && !stored.encryptedKey.includes(PLAIN_KEY),
      '库里存的是密文，明文未落库',
    );

    console.log('== 2. callLlm：DB 解密 → 真 HTTP 请求 → 真实回复 ==');
    const direct = await callLlm([{ role: 'user', content: QUESTION }]);
    check(direct === REAL_REPLY, '拿到模拟模型服务的真实回复', String(direct));
    check(direct !== null && !direct.includes('[本地演示模式]'), '没有走本地演示模式');
    const seen = lastReceived();
    check(seen?.auth === `Bearer ${PLAIN_KEY}`, '请求头带解密后的明文 Key', seen?.auth);
    check(
      seen?.body.model === 'e2e-chat' &&
        seen?.body.temperature === 0.6 &&
        seen?.body.max_tokens === 900,
      '请求体带库里的模型名 / 随机度 / 最大长度',
      JSON.stringify(seen?.body),
    );

    console.log('== 3. 业务兜底链已接上动态配置 ==');
    const soft = await softenFallback(QUESTION);
    check(soft === REAL_REPLY, 'softenFallback 用动态配置拿到回复（过后置闸门）', String(soft));
    const workflow = await runLocalWorkflow({
      message: QUESTION,
      userRole: 'new_hire',
      outputMode: 'chat_text',
    });
    check(
      workflow === REAL_REPLY,
      'runLocalWorkflow 未命中 FAQ → LLM 兜底 → 动态配置',
      String(workflow),
    );

    console.log('== 4. 删掉配置 → 自动降级 [本地演示模式] ==');
    await prisma.modelConfig.deleteMany({ where: { id: 'default' } });
    const fallback = await callLlm([{ role: 'user', content: QUESTION }]);
    check(
      !!fallback && fallback.includes('[本地演示模式]'),
      '无配置时降级本地演示模式',
      String(fallback),
    );
  } finally {
    if (backup) {
      await prisma.modelConfig.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...backup },
        update: backup,
      });
    } else {
      await prisma.modelConfig.deleteMany({ where: { id: 'default' } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log(`\n== 结果：${failures === 0 ? 'ALL PASS' : failures + ' FAIL'} ==`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SCRIPT ERROR', err);
  process.exitCode = 1;
});
