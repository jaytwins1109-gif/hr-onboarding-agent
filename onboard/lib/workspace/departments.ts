// lib/workspace/departments.ts
//
// 部门目录：预置 5 个示例部门（文档第 4 步），员工管理与组织架构共用。
// 幂等：第一次调用时写入，之后只读取，不会重复插入。

import { prisma } from '@/lib/db';

export const DEFAULT_DEPARTMENTS = ['产品部', '技术部', '销售部', '财务部', '人力资源部'];

function departmentId(): string {
  return `dept_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 返回当前所有部门名；空表时先补齐 5 个示例部门 */
export async function listDepartments(): Promise<string[]> {
  if ((await prisma.department.count()) === 0) {
    for (const name of DEFAULT_DEPARTMENTS) {
      await prisma.department.upsert({
        where: { name },
        create: { id: departmentId(), name },
        update: {},
      });
    }
  }
  const rows = await prisma.department.findMany({
    orderBy: { createdAt: 'asc' },
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

/** 新增/编辑员工时填入的新部门：顺手登记进目录 */
export async function ensureDepartment(raw: string): Promise<string> {
  const name = raw.trim().slice(0, 30);
  if (!name) throw new Error('部门名称不能为空');
  await prisma.department.upsert({
    where: { name },
    create: { id: departmentId(), name },
    update: {},
  });
  return name;
}

/** 管理员在组织架构页新增部门；已存在时返回 false 由界面给中文提示 */
export async function createDepartment(raw: string): Promise<{ ok: boolean; name: string }> {
  const name = raw.trim().slice(0, 30);
  if (!name) return { ok: false, name };
  const exists = await prisma.department.findUnique({ where: { name } });
  if (exists) return { ok: false, name };
  await prisma.department.create({ data: { id: departmentId(), name } });
  return { ok: true, name };
}
