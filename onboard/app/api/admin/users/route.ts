// app/api/admin/users/route.ts — 用户管理·列表（批次10 新增）
//
// 第一行 requireAdmin（lib/auth/guard.ts）：真正的安全边界在这里，middleware 只是体验层。
//
// GET：返回全部用户（游客 + 注册，按创建时间倒序，上限 500）。
// 员工类型（employeeType / onboardingDate）是知识库可见性的数据源
//（lib/auth/knowledge-role.ts），Admin 在此页修改后下一轮 /api/ai 立即生效。
// 修改走 PUT /api/admin/users/[id]。
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const rows = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      email: true,
      isGuest: true,
      role: true,
      employeeType: true,
      onboardingDate: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    users: rows.map(({ _count, ...u }) => ({ ...u, messageCount: _count.messages })),
  });
}
