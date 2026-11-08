// app/api/admin/knowledge/route.ts — 知识库管理（2026-11-08 批次8）
//
// GET：KnowledgeItem 分页列表（updatedAt 倒序）。
//   - 默认只返回未软删除的条目；`includeDeleted=true` 连软删除的一起拉
//     （Admin 要能看到删除轨迹，但默认视图保持干净）；
//   - `status=active|draft` 可选过滤；
//   - tags / allowedRoles 是 JSON 字符串（SQLite 无 scalar list），出参统一 parse 成数组。
// POST（新增）：第二步上线表单时补——本轮只有列表 + 软删切换。
//
// 第一行 requireAdmin（lib/auth/guard.ts）：真正的安全边界在这里，middleware 只是体验层。
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
