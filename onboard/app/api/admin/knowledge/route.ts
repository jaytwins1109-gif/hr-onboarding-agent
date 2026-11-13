// app/api/admin/knowledge/route.ts — 知识库管理（2026-11-08 批次8/9）
//
// GET：KnowledgeItem 分页列表（updatedAt 倒序）。
//   - 默认只返回未软删除的条目；`includeDeleted=true` 连软删除的一起拉
//     （Admin 要能看到删除轨迹，但默认视图保持干净）；
//   - `status=active|draft` 可选过滤；
//   - tags / allowedRoles 是 JSON 字符串（SQLite 无 scalar list），出参统一 parse 成数组。
// POST：新增条目（批次9 第二步）。question/answer 必填；其余字段自动补全默认值：
//   scope=new_hire_public / allowedRoles=["new_hire"] / source=admin_manual /
//   version=1 / status=active（可显式传 draft）/ tags 默认 []。
//   校验全部发生在查库之前，非法 body 一律 400。
//
// 第一行 requireAdmin（lib/auth/guard.ts）：真正的安全边界在这里，middleware 只是体验层。
import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';

/** JSON 字符串 → string[]（坏数据一律落空数组，不炸接口） */
function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  try {
    const sp = req.nextUrl.searchParams;
    // 分页上限 100：防一手 pageSize=10^9 把全表拖出来（口径同 /admin/messages）
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize')) || 20));
    const includeDeleted = sp.get('includeDeleted') === 'true';
    const status = sp.get('status')?.trim();

    const where: { isDeleted?: boolean; status?: string } = {};
    if (!includeDeleted) where.isDeleted = false;
    if (status === 'active' || status === 'draft') where.status = status;

    const [rows, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    const items = rows.map((row) => ({
      ...row,
      tags: parseJsonArray(row.tags),
      allowedRoles: parseJsonArray(row.allowedRoles),
    }));

    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    console.error('[admin/knowledge]', err);
    return NextResponse.json({ error: '知识库数据读取失败' }, { status: 500 });
  }
}

/** JSON 字符串 → string[]（入参坏数据落空数组） */
function parseTagsInput(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((t) => typeof t !== 'string')) return null;
  return [...new Set((value as string[]).map((t) => t.trim()).filter(Boolean))];
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  // ── 校验层：全在查库之前 ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是合法 JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'question 必填且不能为空白' }, { status: 400 });
  const answer = typeof input.answer === 'string' ? input.answer.trim() : '';
  if (!answer) return NextResponse.json({ error: 'answer 必填且不能为空白' }, { status: 400 });

  const tags = parseTagsInput(input.tags);
  if (tags === null) {
    return NextResponse.json({ error: 'tags 必须是字符串数组' }, { status: 400 });
  }

  let status = 'active';
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'draft') {
      return NextResponse.json({ error: 'status 只能是 active 或 draft' }, { status: 400 });
    }
    status = input.status;
  }

  // ── 写库层：id 自动生成，默认字段补全（scope/roles 沿用种子口径） ──
  try {
    const row = await prisma.knowledgeItem.create({
      data: {
        id: `faq_admin_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        question,
        answer,
        tags: JSON.stringify(tags),
        scope: 'new_hire_public',
        allowedRoles: JSON.stringify(['new_hire']),
        status,
        source: 'admin_manual',
        version: 1,
      },
    });
    return NextResponse.json(
      {
        item: {
          ...row,
          tags: parseJsonArray(row.tags),
          allowedRoles: parseJsonArray(row.allowedRoles),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[admin/knowledge]', err);
    return NextResponse.json({ error: '知识条目创建失败' }, { status: 500 });
  }
}
