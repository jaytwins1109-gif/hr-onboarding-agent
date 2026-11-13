// app/api/workspace/employees/route.ts
//
// 员工管理：新增 / 编辑。所有权限判断在服务端（文档第 3、4 步）。
// 账号由员工编号自动生成（编号同时是登录标识），避免管理员还要多填一个字段。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { canCreateRole, canManageEmployees } from '@/lib/workspace/access';
import { getWorkspaceViewer } from '@/lib/workspace/session';
import { ensureDepartment } from '@/lib/workspace/departments';
import { accountFromEmployeeNo, newUserId } from '@/lib/workspace/employees';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;
const DENY = () => NextResponse.json({ error: '当前账号无权管理员工' }, { status: 403 });

async function guard() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return { error: NextResponse.json({ error: '请先登录' }, { status: 401 }) };
  if (!canManageEmployees(viewer.role)) return { error: DENY() };
  return { viewer };
}

export async function POST(req: NextRequest) {
  const gate = await guard();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    employeeNo?: unknown;
    department?: unknown;
    role?: unknown;
    password?: unknown;
  } | null;
  const name = String(body?.name ?? '').trim();
  const employeeNo = String(body?.employeeNo ?? '').trim();
  const department = String(body?.department ?? '').trim();
  const role = String(body?.role ?? '').trim();
  const password = String(body?.password ?? '');

  if (!name || name.length > 30) {
    return NextResponse.json({ error: '请填写姓名（不超过 30 个字）' }, { status: 400 });
  }
  if (!employeeNo || employeeNo.length > 40) {
    return NextResponse.json({ error: '请填写员工编号（不超过 40 个字符）' }, { status: 400 });
  }
  if (!department) return NextResponse.json({ error: '请选择或填写部门' }, { status: 400 });
  if (!canCreateRole(gate.viewer.role, role)) {
    return NextResponse.json({ error: '当前账号无权新增这个角色' }, { status: 403 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: '初始密码至少 10 位' }, { status: 400 });
  }

  try {
    if (await prisma.user.findUnique({ where: { employeeNo } })) {
      return NextResponse.json({ error: '这个员工编号已经被使用了' }, { status: 409 });
    }
    const account = accountFromEmployeeNo(employeeNo);
    if (await prisma.user.findUnique({ where: { email: account } })) {
      return NextResponse.json({ error: '对应登录账号已存在，请换一个员工编号' }, { status: 409 });
    }
    const dept = await ensureDepartment(department);
    const user = await prisma.user.create({
      data: {
        id: newUserId(),
        email: account,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        name,
        employeeNo,
        department: dept,
        role,
        isGuest: false,
        isActive: true,
      },
    });
    return NextResponse.json({ ok: true, id: user.id, account });
  } catch (err) {
    console.error('[workspace/employees:create]', err);
    return NextResponse.json({ error: '新增员工失败，请稍后再试' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await guard();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    name?: unknown;
    department?: unknown;
    isActive?: unknown;
    password?: unknown;
  } | null;
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: '缺少员工标识' }, { status: 400 });

  const data: { name?: string; department?: string; isActive?: boolean; password?: string } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 30) {
      return NextResponse.json({ error: '请填写姓名（不超过 30 个字）' }, { status: 400 });
    }
    data.name = name;
  }
  if (body?.department !== undefined) {
    const dept = String(body.department).trim();
    if (!dept) return NextResponse.json({ error: '部门不能为空' }, { status: 400 });
    data.department = await ensureDepartment(dept);
  }
  if (body?.isActive !== undefined) data.isActive = body.isActive === true;
  if (body?.password !== undefined && String(body.password) !== '') {
    const password = String(body.password);
    if (password.length < 10) {
      return NextResponse.json({ error: '新密码至少 10 位' }, { status: 400 });
    }
    data.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.isGuest) {
      return NextResponse.json({ error: '找不到这个员工' }, { status: 404 });
    }
    // 员工编号与角色不在本步编辑范围内：即使请求里夹带也一律忽略
    await prisma.user.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[workspace/employees:update]', err);
    return NextResponse.json({ error: '保存失败，请稍后再试' }, { status: 500 });
  }
}
