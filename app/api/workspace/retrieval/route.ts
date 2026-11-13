// app/api/workspace/retrieval/route.ts — 「查找测试」小页面的检索接口（仅管理员）
//
// 只返回制度原文片段与出处，不生成回答。可见性过滤发生在切片与排序之前，
// 由 retrieveForQuestion 调用 canViewPolicy，和制度中心是同一套规则。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canUseRetrievalTest } from '@/lib/workspace/access';
import { checkQuestion } from '@/lib/workspace/consultations';
import { retrieveForQuestion, type RetrievalPolicy } from '@/lib/workspace/retrieval';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canUseRetrievalTest(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权使用查找测试' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const check = checkQuestion(body?.question);
  const question = check.value;
  if (!check.ok || !question) {
    return NextResponse.json({ error: check.error ?? '请输入问题' }, { status: 400 });
  }

  // 以哪个部门的员工身份测试：只接受库里真实存在的部门名，回退到本人部门。
  const departments = await prisma.department.findMany({ select: { name: true } });
  const allowed = new Set(departments.map((row) => row.name));
  const requested = typeof body?.department === 'string' ? body.department.trim() : '';
  const department = allowed.has(requested) ? requested : viewer.department;

  const docs = (await prisma.policyDocument.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      scope: true,
      version: true,
      effectiveDate: true,
      status: true,
      content: true,
    },
  })) as RetrievalPolicy[];

  const topK = typeof body?.topK === 'number' ? body.topK : undefined;
  const result = retrieveForQuestion(question, docs, department, { topK });
  return NextResponse.json({
    ok: true,
    ...result,
    department,
    departments: departments.map((row) => row.name),
  });
}
