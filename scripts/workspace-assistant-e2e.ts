// scripts/workspace-assistant-e2e.ts
//
// 第 15/16 段的端到端冒烟：真 dev server + 真库 + 示例账号。
// 覆盖：助手页面能打开、提问落库并给占位回复、最近咨询、跨账号越权 404、
// 员工调查找测试 403、管理员查找能召回真实示例制度、部门专属制度不串台。
//
// 跑法（需先 npm run dev）：
//   npm run workspace:e2e
//
// 脚本会删掉自己创建的那段咨询，不往示例库里留测试对话。

import { prisma } from '@/lib/db';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const PASSWORD = 'DemoPass12345';
const EMPLOYEE_A = 'cx-0001@example.com';
const EMPLOYEE_B = 'cx-0002@example.com';
const HR_ADMIN = 'cx-0100@example.com';

let failures = 0;
function check(ok: boolean, label: string, extra = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
}

interface ApiResult {
  status: number;
  data: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

async function login(account: string): Promise<string> {
  const res = await fetch(`${BASE}/api/workspace/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`登录失败 ${account}: ${res.status}`);
  const raw = res.headers.get('set-cookie') ?? '';
  const cookie = raw.split(';')[0];
  if (!cookie.includes('cx_token=')) throw new Error('登录后没有拿到票据');
  return cookie;
}

async function api(path: string, cookie: string, body?: unknown): Promise<ApiResult> {
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
    // 页面返回 HTML，保留原文供断言
  }
  return { status: res.status, data };
}

interface ChunkView {
  policyName: string;
  version: string;
  location: string;
  text: string;
}

function chunksOf(result: ApiResult): ChunkView[] {
  return (asRecord(result.data).chunks ?? []) as ChunkView[];
}

async function main(): Promise<void> {
  let createdId = '';
  try {
    const employee = await login(EMPLOYEE_A);
    console.log('== 1. 员工服务助手页面 ==');
    const page = await api('/workspace/assistant', employee);
    check(page.status === 200, '助手页面返回 200', String(page.status));
    check(
      typeof page.data === 'string' && page.data.includes('工作中的疑问，从这里开始。'),
      '页面渲染欢迎区',
    );

    console.log('== 2. 提问落库 + 固定占位回复 ==');
    const sent = await api('/api/workspace/consultations', employee, {
      message: '年假可以结转到明年吗？',
    });
    const sentData = asRecord(sent.data);
    createdId = String(sentData.consultationId ?? '');
    const messages = (sentData.messages ?? []) as {
      role: string;
      content: string;
      seq: number;
    }[];
    check(sent.status === 201 && !!createdId, '新建咨询返回 201 与会话 id', String(sent.status));
    check(messages.length === 2, '一轮写入用户与助手两条消息', String(messages.length));
    check(messages[0]?.content === '年假可以结转到明年吗？', '用户原话原样保存');
    check(messages[1]?.content.includes('占位回复'), '助手回复明确标注占位');
    check(messages[0]?.seq === 1 && messages[1]?.seq === 2, '消息顺序号稳定');

    console.log('== 3. 最近咨询与恢复整段对话 ==');
    const list = await api('/api/workspace/consultations', employee);
    const ids = ((asRecord(list.data).consultations ?? []) as { id: string }[]).map(
      (row) => row.id,
    );
    check(ids.includes(createdId), '新会话出现在最近咨询里');
    const detail = await api(`/api/workspace/consultations/${createdId}`, employee);
    const detailMessages = (asRecord(asRecord(detail.data).consultation).messages ??
      []) as unknown[];
    check(
      detail.status === 200 && detailMessages.length === 2,
      '恢复整段对话',
      String(detail.status),
    );

    console.log('== 4. 别人的会话 id 拿不到 ==');
    const other = await login(EMPLOYEE_B);
    const denied = await api(`/api/workspace/consultations/${createdId}`, other);
    check(denied.status === 404, '跨账号访问返回 404（不泄露内容）', String(denied.status));
    const otherList = await api('/api/workspace/consultations', other);
    const otherIds = ((asRecord(otherList.data).consultations ?? []) as { id: string }[]).map(
      (row) => row.id,
    );
    check(!otherIds.includes(createdId), '别人的最近咨询列表里也不出现');

    console.log('== 5. 查找测试仅管理员可用 ==');
    check(
      (await api('/api/workspace/retrieval', employee, { question: '年假' })).status === 403,
      '员工调用查找测试 403',
    );

    console.log('== 6. 管理员查找真实示例制度 ==');
    const admin = await login(HR_ADMIN);
    const reimbursement = await api('/api/workspace/retrieval', admin, {
      question: '出差住宿报销上限是多少',
      department: '产品部',
      topK: 4,
    });
    const reimburseChunks = chunksOf(reimbursement);
    check(reimbursement.status === 200, '查找测试返回 200', String(reimbursement.status));
    check(reimburseChunks.length > 0, '召回至少一段原文', String(reimburseChunks.length));
    check(
      reimburseChunks.some(
        (chunk) => chunk.text.includes('500') && chunk.text.includes('一线城市'),
      ),
      '召回的原文同时含金额与适用条件',
    );
    check(
      reimburseChunks.every((chunk) => !!chunk.policyName && !!chunk.version && !!chunk.location),
      '每段都带制度名称 / 版本 / 位置',
    );

    console.log('== 7. 部门专属制度不串台 ==');
    const question = '代码评审需要几名评审人';
    const tech = chunksOf(
      await api('/api/workspace/retrieval', admin, { question, department: '技术部', topK: 8 }),
    );
    const product = chunksOf(
      await api('/api/workspace/retrieval', admin, { question, department: '产品部', topK: 8 }),
    );
    check(
      tech.some((chunk) => chunk.policyName.includes('技术部')),
      '技术部身份能召回本部门专属制度',
    );
    check(
      !product.some((chunk) => chunk.policyName.includes('技术部')),
      '产品部身份看不到技术部专属制度',
    );
  } finally {
    if (createdId) {
      await prisma.consultation.deleteMany({ where: { id: createdId } });
      console.log(`== 清理：已删除本次测试咨询 ${createdId} ==`);
    }
    await prisma.$disconnect();
  }

  console.log(`\n== 结果：${failures === 0 ? 'ALL PASS' : failures + ' FAIL'} ==`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SCRIPT ERROR', err);
  process.exitCode = 1;
});
