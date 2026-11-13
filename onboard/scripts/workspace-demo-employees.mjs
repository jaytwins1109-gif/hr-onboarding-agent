// scripts/workspace-demo-employees.mjs
//
// 生成工作台虚构示例员工（文档第 7 步）：5 个部门各 2~3 名普通员工，
// 外加 1 名 HR 管理员、1 名产品运营；系统管理员复用「创建工作空间」时建的那个。
// 全部为模拟数据，统一示例密码，账号清单写到 samples/示例账号清单.csv。
// 可重复执行：按员工编号前缀清理自己生成的数据后重建，不动任何其他账号。

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_PASSWORD = 'DemoPass12345';
const DEPARTMENTS = ['产品部', '技术部', '销售部', '财务部', '人力资源部'];
const ROLE_LABEL = {
  USER: '员工',
  ADMIN: 'HR 管理员',
  PRODUCT_OPS: '产品运营',
  DEVELOPER: '系统管理员',
};

const PEOPLE = [
  ['李知微', 'CX-0001', '产品部', 'USER'],
  ['陈望舒', 'CX-0002', '产品部', 'USER'],
  ['赵一诺', 'CX-0003', '产品部', 'USER'],
  ['王思远', 'CX-0004', '技术部', 'USER'],
  ['孙浩然', 'CX-0005', '技术部', 'USER'],
  ['吴清越', 'CX-0006', '技术部', 'USER'],
  ['郑可欣', 'CX-0007', '销售部', 'USER'],
  ['冯嘉言', 'CX-0008', '销售部', 'USER'],
  ['许静怡', 'CX-0009', '财务部', 'USER'],
  ['蒋明哲', 'CX-0010', '财务部', 'USER'],
  ['沈书瑶', 'CX-0011', '人力资源部', 'USER'],
  ['韩亦然', 'CX-0012', '人力资源部', 'USER'],
  ['林若彤', 'CX-0100', '人力资源部', 'ADMIN'],
  ['周予安', 'CX-0101', '产品部', 'PRODUCT_OPS'],
];

const newId = () => `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const accountOf = (no) => `${no.toLowerCase()}@example.com`;

async function main() {
  // 只清理本脚本自己生成的编号，绝不碰工作空间管理员或其他真实账号
  const generatedNos = [...PEOPLE.map((p) => p[1]), 'CX-0199'];
  await prisma.user.deleteMany({ where: { employeeNo: { in: generatedNos } } });

  for (const name of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      create: { id: `dept_${name}_demo`, name },
      update: {},
    });
  }

  // 没有系统管理员时补一个（就是「创建工作空间」那位；这里只做本机演示兜底）
  let developer = await prisma.user.findFirst({
    where: { isGuest: false, role: 'DEVELOPER' },
    orderBy: { createdAt: 'asc' },
  });
  const createdDeveloper = !developer;
  if (!developer) {
    developer = await prisma.user.create({
      data: {
        id: newId(),
        email: accountOf('CX-0199'),
        employeeNo: 'CX-0199',
        name: '示例管理员',
        department: '人力资源部',
        password: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: 'DEVELOPER',
        isGuest: false,
        isActive: true,
      },
    });
  }

  const rows = [];
  for (const [name, no, department, role] of PEOPLE) {
    await prisma.user.create({
      data: {
        id: newId(),
        email: accountOf(no),
        employeeNo: no,
        name,
        department,
        password: await bcrypt.hash(DEMO_PASSWORD, 10),
        role,
        isGuest: false,
        isActive: true,
      },
    });
    rows.push({ name, no, department, role, account: accountOf(no) });
  }

  // 账号清单表格：标注「模拟数据」，统一管理示例密码，方便逐个角色登录测试
  const lines = [
    '姓名,员工编号,部门,角色,登录账号,示例密码,备注',
    ...rows.map(
      (r) =>
        `${r.name},${r.no},${r.department},${ROLE_LABEL[r.role]},${r.account},${DEMO_PASSWORD},模拟数据：仅用于本机演示`,
    ),
    `${developer.name ?? '示例管理员'},${developer.employeeNo ?? '—'},${developer.department ?? '未设置'},系统管理员,${developer.email ?? accountOf('CX-0199')},${createdDeveloper ? DEMO_PASSWORD : '创建时设置'},模拟数据：${createdDeveloper ? '脚本兜底创建的工作空间管理员' : '沿用创建工作空间时的密码'}`,
  ];
  mkdirSync(join(ROOT, 'samples'), { recursive: true });
  writeFileSync(
    join(ROOT, 'samples', '示例账号清单.csv'),
    `\uFEFF${lines.join('\r\n')}\r\n`,
    'utf8',
  );

  console.log(`[demo] 示例部门 ${DEPARTMENTS.length} 个，示例员工 ${PEOPLE.length} 名`);
  console.log('[demo] 系统管理员：', developer.email ?? developer.name);
  console.log('[demo] 账号清单：samples/示例账号清单.csv（统一示例密码，仅用于本机演示）');
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[demo]', err);
    await prisma.$disconnect();
    process.exit(1);
  });
