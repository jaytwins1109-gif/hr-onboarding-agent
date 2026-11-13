// scripts/workspace-demo-leave.mjs
//
// 生成 2026 年度虚构示例年假余额（文档第 13 步）：每人余额各不相同，
// 每人 2~4 条流水，原因里都带「示例」二字；余额恒等于流水合计。
// 可重复执行：只清理自己造的 kind='demo' 且年度为 2026 的流水，
// 绝不动 HR 真实录入或调整产生的流水。

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const YEAR = 2026;

if (!process.env.DATABASE_URL) {
  const raw = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(raw);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const round1 = (n) => Math.round(n * 10) / 10;
const newId = () => `lv_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// 15 个互不相同的余额，覆盖整数、半数与小数值
const TARGETS = [2.5, 5, 7.5, 10, 12, 3, 4.5, 6, 8, 9.5, 11, 13, 1.5, 14, 15];

/** 用「发放 - 已休 - 逾期作废」凑出目标余额，按 variant 产出 2/3/4 条流水 */
function buildEntries(target, variant) {
  const taken = [2, 3, 1.5, 2.5][variant % 4];
  const expired = [0, 1, 0.5, 0][variant % 4];
  const grant = round1(target + taken + expired);
  const entries = [
    { delta: grant, reason: `示例：年初发放 ${grant} 天`, kind: 'demo' },
    { delta: -taken, reason: `示例：已休 ${taken} 天`, kind: 'demo' },
  ];
  if (expired > 0) {
    entries.push({
      delta: -expired,
      reason: `示例：结转逾期作废 ${expired} 天`,
      kind: 'demo',
    });
  }
  if (variant % 4 === 3) {
    const whole = Math.floor(taken);
    entries.splice(
      1,
      1,
      { delta: -whole, reason: `示例：已休 ${whole} 天`, kind: 'demo' },
      {
        delta: -round1(taken - whole),
        reason: `示例：已休 ${round1(taken - whole)} 天`,
        kind: 'demo',
      },
    );
  }
  return entries;
}

async function main() {
  await prisma.leaveLedger.deleteMany({ where: { kind: 'demo', year: YEAR } });

  const users = await prisma.user.findMany({
    where: { isGuest: false, employeeNo: { not: null } },
    orderBy: { employeeNo: 'asc' },
    select: { id: true, name: true, email: true, employeeNo: true },
  });

  const csv = ['姓名,员工编号,年度,剩余年假天数,流水条数,备注'];
  let totalEntries = 0;
  for (let i = 0; i < users.length; i += 1) {
    const user = users[i];
    const target = TARGETS[i % TARGETS.length];
    const entries = buildEntries(target, i % 4);
    const sum = round1(entries.reduce((acc, e) => acc + e.delta, 0));
    if (sum !== target) throw new Error(`${user.employeeNo} 流水合计 ${sum} != 目标 ${target}`);

    // 时间上略微错开，让流水列表里的顺序与真实录入一致
    const base = Date.UTC(YEAR, 0, 2 + (i % 10), 1, 0, 0);
    for (let j = 0; j < entries.length; j += 1) {
      await prisma.leaveLedger.create({
        data: {
          id: newId(),
          userId: user.id,
          year: YEAR,
          delta: entries[j].delta,
          reason: entries[j].reason,
          kind: 'demo',
          operatorId: null,
          createdAt: new Date(base + j * 86400000),
        },
      });
    }
    totalEntries += entries.length;
    csv.push(
      `${user.name || user.email || '未填写姓名'},${user.employeeNo},${YEAR},${target},${entries.length},模拟数据：仅用于本机演示`,
    );
  }

  mkdirSync(join(ROOT, 'samples'), { recursive: true });
  writeFileSync(join(ROOT, 'samples', '示例年假余额.csv'), `\uFEFF${csv.join('\r\n')}\r\n`, 'utf8');

  console.log(`[demo-leave] 示例员工 ${users.length} 名，${YEAR} 年度流水 ${totalEntries} 条`);
  console.log(`[demo-leave] 余额取值 ${TARGETS.length} 种，各不相同；每笔原因均带「示例」`);
  console.log('[demo-leave] 清单：samples/示例年假余额.csv');
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[demo-leave]', err);
    await prisma.$disconnect();
    process.exit(1);
  });
