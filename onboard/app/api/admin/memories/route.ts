// app/api/admin/memories/route.ts — 兼容壳（2026-11-07 底层换血）
//
// 记忆管理已随旧业务下线：HR 助理不读 memory，
// KnowledgeItem 是唯一的业务数据源（由 HR 侧维护，运行时只读）。
//
// 保留这个路由只是为了让既有 Admin 前端页面（记忆管理页）不发 404、能正常渲染空表：
//   GET         ：返回空列表（items: [] / total: 0）——页面能渲染，不假装有数据
//   POST/PUT/DELETE：HTTP 501 NOT_IMPLEMENTED——明确拒绝，**绝不返回 200 假成功**
// 权限语义不变：第一行 requireAdmin，非管理员 403。
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  // TODO(hr-assistant): 记忆/偏好功能已下线，HR 业务不读 memory；保留空结构仅为兼容旧 UI 侧栏。
  return NextResponse.json({ items: [], total: 0 });
}

/** 写操作统一 501：下线就是下线，调用方（admin UI）会拿到明确的错误体 */
function notImplemented() {
  return NextResponse.json(
    { error: 'NOT_IMPLEMENTED', message: '记忆管理已下线，HR 业务不读 memory' },
    { status: 501 },
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  return notImplemented();
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  return notImplemented();
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  return notImplemented();
}
