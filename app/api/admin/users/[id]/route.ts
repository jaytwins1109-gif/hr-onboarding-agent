// app/api/admin/users/[id]/route.ts — 用户管理·修改（批次10 新增）
//
// PUT：修改 employeeType（new_hire | employee）与 onboardingDate（可选）。
//   - 校验全部发生在查库之前，非法 body 一律 400；
//   - 游客一律 400：游客在 C 端恒按 new_hire 处理（无员工类型概念），改了也不生效，
//     不给运维留"改了为什么没用"的暗雷；
//   - role 不开放修改：提权唯一路径是 scripts/promote-admin.ts（拍板过的设计）。
// 生效语义：employeeType 不入 JWT，/api/ai 每次请求读库映射，保存即生效。
import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';

const VALID_EMPLOYEE_TYPES = ['new_hire', 'employee'];

function parseOnboardingDate(raw: unknown): Date | null | 'invalid' {
  if (raw === undefined) return null; // 未传 → 不改
  if (typeof raw !== 'string' || !raw.trim()) return 'invalid';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 'invalid' : date;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'BAD_JSON', message: '请求体不是合法 JSON' },
      { status: 400 },
    );
  }

  const { employeeType, onboardingDate } = (body ?? {}) as {
    employeeType?: unknown;
    onboardingDate?: unknown;
  };

  // 校验先行（查库之前）
  if (employeeType !== undefined && !VALID_EMPLOYEE_TYPES.includes(employeeType as string)) {
    return NextResponse.json(
      { error: 'INVALID_EMPLOYEE_TYPE', message: 'employeeType 只能是 new_hire 或 employee' },
      { status: 400 },
    );
  }
  const parsedDate = parseOnboardingDate(onboardingDate);
  if (parsedDate === 'invalid') {
    return NextResponse.json(
      { error: 'INVALID_ONBOARDING_DATE', message: 'onboardingDate 必须是合法的日期字符串' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user)
    return NextResponse.json({ error: 'NOT_FOUND', message: '用户不存在' }, { status: 404 });
  if (user.isGuest) {
    return NextResponse.json(
      { error: 'GUEST_USER', message: '游客无员工类型概念，不可修改' },
      { status: 400 },
    );
  }

  const data: { employeeType?: string; onboardingDate?: Date } = {};
  if (employeeType !== undefined) data.employeeType = employeeType as string;
  if (parsedDate !== null) data.onboardingDate = parsedDate;

  try {
    const updated = await prisma.user.update({ where: { id }, data });
    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        isGuest: updated.isGuest,
        role: updated.role,
        employeeType: updated.employeeType,
        onboardingDate: updated.onboardingDate,
      },
    });
  } catch (err) {
    // 并发删除：更新目标已不存在
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'NOT_FOUND', message: '用户不存在' }, { status: 404 });
    }
    throw err;
  }
}
