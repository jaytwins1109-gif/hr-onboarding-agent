// app/api/admin/knowledge/[id]/route.ts — 知识库条目更新（2026-11-08 批次8）
//
// PUT /api/admin/knowledge/:id：部分更新。
//   - `isDeleted`：软删除切换。true → isDeleted=true + deletedAt=now（留痕）；
//     false → 恢复（deletedAt 清空）。检索链路只读 isDeleted=false 的条目，
//     所以切换即时生效（local-workflow 每轮直连 Prisma，无缓存层）。
//   - `question / answer / tags / status`：内容更新，任一内容字段变更时 version +1。
//   - 校验全部发生在查库**之前**：ADMIN + 非法 body 直接 400，不打 DB。
//   - scope / allowedRoles / source 本轮不开放（第二步表单一起定）。
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';

/** JSON 字符串 → string[]（出参统一 parse，坏数据落空数组） */
function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;

  // ── 校验层：全在查库之前，非法 body 一律 400 ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是合法 JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  const data: {
    question?: string;
    answer?: string;
    tags?: string;
    status?: string;
    isDeleted?: boolean;
    deletedAt?: Date | null;
    // Prisma 的自增写法是对象（{ increment: n }），类型上要放开
    version?: number | { increment: number };
  } = {};
  let contentChanged = false;

  if ('question' in patch || 'answer' in patch || 'tags' in patch || 'status' in patch) {
    if ('question' in patch) {
      const q = typeof patch.question === 'string' ? patch.question.trim() : '';
      if (!q) return NextResponse.json({ error: 'question 必填且不能为空白' }, { status: 400 });
      data.question = q;
      contentChanged = true;
    }
    if ('answer' in patch) {
      const a = typeof patch.answer === 'string' ? patch.answer.trim() : '';
      if (!a) return NextResponse.json({ error: 'answer 必填且不能为空白' }, { status: 400 });
      data.answer = a;
      contentChanged = true;
    }
    if ('tags' in patch) {
      if (!Array.isArray(patch.tags) || patch.tags.some((t) => typeof t !== 'string')) {
        return NextResponse.json({ error: 'tags 必须是字符串数组' }, { status: 400 });
      }
      const tags = [...new Set((patch.tags as string[]).map((t) => t.trim()).filter(Boolean))];
      data.tags = JSON.stringify(tags);
      contentChanged = true;
    }
    if ('status' in patch) {
      if (patch.status !== 'active' && patch.status !== 'draft') {
        return NextResponse.json({ error: 'status 只能是 active 或 draft' }, { status: 400 });
      }
      data.status = patch.status;
    }
  }

  if ('isDeleted' in patch) {
    if (typeof patch.isDeleted !== 'boolean') {
      return NextResponse.json({ error: 'isDeleted 必须是布尔值' }, { status: 400 });
    }
    data.isDeleted = patch.isDeleted;
    // 软删除留痕：删则记时间，恢复则清空——检索守卫看的是 isDeleted || deletedAt 任一
    data.deletedAt = patch.isDeleted ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: '没有可更新的字段，至少提供 question/answer/tags/status/isDeleted 之一' },
      { status: 400 },
    );
  }
  if (contentChanged) data.version = { increment: 1 };

  // ── 写库层 ──
  try {
    const row = await prisma.knowledgeItem.update({ where: { id }, data });
    return NextResponse.json({
      item: { ...row, tags: parseJsonArray(row.tags), allowedRoles: parseJsonArray(row.allowedRoles) },
    });
  } catch (err) {
    // Prisma P2025：update 的 where 没命中 → 条目不存在
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });
    }
    console.error('[admin/knowledge/:id]', err);
    return NextResponse.json({ error: '知识条目更新失败' }, { status: 500 });
  }
}
