// scripts/workspace-answer-e2e.ts
//
// 第 17 段端到端冒烟：真 dev server + 真库 + 本地 OpenAI 兼容模拟模型服务。
// 注意：模拟服务用的是**本地测试 Key**，不是外部真实模型凭据；验证的是
// 「管理员在模型配置里存了 Key → 员工提问 → 检索 → LLM → 角标与引用」这条完整链路。
//
//   npm run answer:e2e              # 完整验证，结束自动恢复配置 / 删测试会话 / 关服务
//   npm run answer:e2e -- --hold    # 起常驻模拟服务 + 写入配置，供浏览器实机验证
//   npm run answer:e2e -- --cleanup # 恢复原配置、删除测试咨询会话
//
// 模拟服务会解析 prompt 里的 <retrieved_context> 块，找出真正含「500 元」那段并引用它的编号，
// 所以角标对应的是服务端分配的真实编号，不是写死的 [1]。

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/workspace/model-config';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const PASSWORD = 'DemoPass12345';
const EMPLOYEE_A = 'cx-0001@example.com';
const EMPLOYEE_B = 'cx-0002@example.com';
const PLAIN_KEY = 'sk-answer-e2e-local-only';
const QUESTION = '出差住宿报销上限是多少？';
const STATE_FILE = join(process.cwd(), 'tmp', 'answer-e2e-state.json');
const HOLD_PORT = 8999;

const args = process.argv.slice(2);
const hold = args.includes('--hold');
const cleanup = args.includes('--cleanup');

let failures = 0;
function check(ok: boolean, label: string, extra = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

interface SavedState {
  config: Record<string, unknown> | null;
  consultationIds: string[];
}

function loadState(): SavedState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as SavedState;
  } catch {
    return null;
  }
}

function saveState(state: SavedState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

const CONFIG_FIELDS = [
  'endpoint',
  'modelName',
  'encryptedKey',
  'hasKey',
  'temperature',
  'maxTokens',
  'version',
  'updatedById',
] as const;

async function backupConfig(): Promise<Record<string, unknown> | null> {
  const row = await prisma.modelConfig.findUnique({ where: { id: 'default' } });
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const field of CONFIG_FIELDS) out[field] = row[field];
  return out;
}

async function restoreConfig(state: SavedState): Promise<void> {
  if (state.config) {
    const c = state.config;
    const data = {
      endpoint: String(c.endpoint ?? ''),
      modelName: String(c.modelName ?? ''),
      encryptedKey: String(c.encryptedKey ?? ''),
      hasKey: Boolean(c.hasKey),
      temperature: Number(c.temperature ?? 0.3),
      maxTokens: Number(c.maxTokens ?? 2048),
      version: Number(c.version ?? 1),
      updatedById:
        c.updatedById === null || c.updatedById === undefined ? null : String(c.updatedById),
    };
    await prisma.modelConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
  } else {
    await prisma.modelConfig.deleteMany({ where: { id: 'default' } });
  }
}

async function installConfig(endpoint: string): Promise<void> {
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 16) throw new Error('缺少 AUTH_SECRET');
  const data = {
    endpoint,
    modelName: 'answer-e2e',
    encryptedKey: encryptSecret(PLAIN_KEY, secret),
    hasKey: true,
    temperature: 0,
    maxTokens: 900,
    version: 99,
  };
  await prisma.modelConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  });
}

async function cleanupState(): Promise<void> {
  const state = loadState();
  if (!state) {
    console.log('没有待清理的 e2e 状态');
    return;
  }
  await restoreConfig(state);
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const removed = await prisma.consultation.deleteMany({
    where: {
      OR: [
        { id: { in: state.consultationIds } },
        { title: { contains: '出差住宿报销上限' }, updatedAt: { gte: recent } },
      ],
    },
  });
  unlinkSync(STATE_FILE);
  console.log(`已恢复模型配置、删除 ${removed.count} 条测试咨询`);
}

/** 从 prompt 里服务端分配的编号片段中，找出真正含 500 元的那段 */
function pickCitation(userPrompt: string): { id: number; evidence: string } {
  const re = /<retrieved_context>([\s\S]*?)<\/retrieved_context>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(userPrompt)) !== null) {
    const idMatch = match[1].match(/^\[(\d+)\]/m);
    const found = match[1].match(/一线城市上限 500 元\/人\/晚/);
    if (idMatch && found) return { id: Number(idMatch[1]), evidence: found[0] };
  }
  return { id: 1, evidence: '' };
}

function startMockServer(port: number): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      let userPrompt = '';
      try {
        const parsed = JSON.parse(body) as { messages?: { role: string; content: string }[] };
        userPrompt = parsed.messages?.find((m) => m.role === 'user')?.content ?? '';
      } catch {
        userPrompt = '';
      }
      const cite = pickCitation(userPrompt);
      const answer = {
        status: 'supported',
        conclusions: [
          {
            text: '一线城市住宿上限为 500 元/人/晚。',
            citation_ids: [cite.id],
            ...(cite.evidence ? { evidence: cite.evidence } : {}),
          },
        ],
        missing: [],
        conflicts: [],
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

async function login(account: string): Promise<string> {
  const res = await fetch(`${BASE}/api/workspace/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`登录失败 ${account}: ${res.status}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie.includes('cx_token=')) throw new Error('登录后没有拿到票据');
  return cookie;
}

async function api(
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // 保留原文
  }
  return { status: res.status, data };
}

async function sendQuestion(
  cookie: string,
  message: string,
  consultationId?: string,
): Promise<{ consultationId: string; messageId: string }> {
  const res = await api('/api/workspace/consultations', cookie, { message, consultationId });
  const data = asRecord(res.data);
  const rows = (data.messages ?? []) as { id: string; role: string }[];
  const user = [...rows].reverse().find((row) => row.role === 'user');
  if (res.status !== 201 || !data.consultationId || !user) {
    throw new Error(`提问失败 ${res.status}: ${JSON.stringify(data)}`);
  }
  return { consultationId: String(data.consultationId), messageId: user.id };
}

interface AnswerRow {
  status: string;
  answerStatus?: string | null;
  payload?: Record<string, unknown> | null;
  error?: string | null;
}

async function pollAnswer(
  cookie: string,
  consultationId: string,
  messageId: string,
): Promise<AnswerRow | null> {
  const path = `/api/workspace/consultations/${consultationId}/answer?messageId=${messageId}`;
  for (let i = 0; i < 40; i += 1) {
    const res = await api(path, cookie);
    const rows = (asRecord(res.data).answers ?? []) as AnswerRow[];
    const row = rows[0];
    if (row && row.status !== 'pending') return row;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

const createdIds: string[] = [];

async function verify(): Promise<void> {
  const employee = await login(EMPLOYEE_A);

  console.log('== 1. 已配置 Key：提问 → 触发异步任务 → 轮询 ==');
  const { consultationId, messageId } = await sendQuestion(employee, QUESTION);
  createdIds.push(consultationId);
  const triggered = await api(`/api/workspace/consultations/${consultationId}/answer`, employee, {
    messageId,
  });
  check(triggered.status === 202, '触发返回 202 与 pending', String(triggered.status));
  check(asRecord(triggered.data).status === 'pending', '任务初始状态 pending');

  const row = await pollAnswer(employee, consultationId, messageId);
  check(row?.status === 'done', '轮询到 done（后台任务真正跑完）', String(row?.status));
  const payload = asRecord(row?.payload ?? {});
  check(payload.status === 'supported', '回答状态依据充分', String(payload.status));
  check(payload.verified === true, '结论通过确定性规则核验');

  const conclusions = (payload.conclusions ?? []) as {
    text: string;
    citationIds: number[];
  }[];
  check(conclusions.length === 1 && conclusions[0].text.includes('500'), '结论含 500 元');
  const citedId = conclusions[0]?.citationIds?.[0] ?? 0;
  check(citedId >= 1, '角标编号来自服务端分配的候选片段', String(citedId));

  const citations = (payload.citations ?? []) as {
    id: number;
    used: boolean;
    policyName: string;
    version: string;
    location: string;
    fingerprint: string;
    downloadUrl: string;
  }[];
  const used = citations.find((citation) => citation.used && citation.id === citedId);
  check(!!used, '引用快照里能按角标编号找到对应片段');
  check(
    !!used &&
      !!used.policyName &&
      !!used.version &&
      !!used.location &&
      /^[0-9a-f]{8}$/.test(used.fingerprint) &&
      used.downloadUrl.includes('/api/workspace/policies/'),
    '引用带制度名 / 版本 / 位置 / 指纹 / 下载链接',
  );
  check(String(payload.notice ?? '').includes('示例制度'), '提示当前引用示例制度');

  console.log('== 2. 别人的会话 id 读不到回答 ==');
  const other = await login(EMPLOYEE_B);
  const denied = await api(`/api/workspace/consultations/${consultationId}/answer`, other);
  check(denied.status === 404, '跨账号轮询返回 404', String(denied.status));

  console.log('== 3. 删掉配置 → 无 Key 降级依据不足 ==');
  await prisma.modelConfig.deleteMany({ where: { id: 'default' } });
  const second = await sendQuestion(employee, '试用期有哪些规定？');
  createdIds.push(second.consultationId);
  await api(`/api/workspace/consultations/${second.consultationId}/answer`, employee, {
    messageId: second.messageId,
  });
  const fallback = await pollAnswer(employee, second.consultationId, second.messageId);
  const fallbackPayload = asRecord(fallback?.payload ?? {});
  check(fallback?.status === 'done', '降级任务也正常结束（不一直转圈）', String(fallback?.status));
  check(
    fallbackPayload.status === 'insufficient',
    '降级为「依据不足」',
    String(fallbackPayload.status),
  );
  check(
    String(fallbackPayload.notice ?? '').includes('演示模式') ||
      (fallbackPayload.missing as string[] | undefined)?.join('').includes('演示模式') === true,
    '明示本地演示模式未配真实模型',
  );
  check(
    ((fallbackPayload.conclusions ?? []) as unknown[]).length === 0,
    '降级时不产出任何带角标结论',
  );
}

async function main(): Promise<void> {
  if (cleanup) {
    await cleanupState();
    await prisma.$disconnect();
    return;
  }

  const { server, port } = await startMockServer(hold ? HOLD_PORT : 0);
  const endpoint = `http://127.0.0.1:${port}/v1`;
  if (!existsSync(STATE_FILE)) {
    saveState({ config: await backupConfig(), consultationIds: [] });
  }
  await installConfig(endpoint);

  if (hold) {
    const state = loadState() ?? { config: null, consultationIds: [] };
    state.consultationIds = [];
    saveState(state);
    console.log(
      `HOLD READY：模拟模型服务 ${endpoint}，库里已写入测试配置；跑完浏览器实机后执行 --cleanup`,
    );
    return; // server 保持监听，进程常驻
  }

  try {
    await verify();
  } finally {
    const state = loadState() ?? { config: null, consultationIds: [] };
    state.consultationIds = [...new Set([...state.consultationIds, ...createdIds])];
    saveState(state);
    await cleanupState();
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
