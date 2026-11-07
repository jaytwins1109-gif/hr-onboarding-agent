// scripts/clear-memory.ts — 一次性清理脚本（2026-11-07 底层换血遗留数据）
//
// 背景：旧业务时代的长期记忆（口味偏好/忌口/场景等）与新 HR 助理业务完全无关，
// 属于脏数据；换血后的业务层（lib/llm/local-workflow.ts / lib/chat/handlers.ts）
// 已不读 prisma.memory，但库里的历史行仍在。
//
// 本脚本只做一件事：prisma.memory.deleteMany({}) 清空记忆表并打印删除条数。
// **不删 User / Message 表**（用户与对话历史仍是有效资产）。
//
// 用法：
//   node --import ./scripts/ts-alias-register.mjs scripts/clear-memory.ts
import { prisma } from '@/lib/db';

async function main() {
  const count = await prisma.memory.deleteMany({});
  console.log(`[clear-memory] 已删除 ${count.count} 条 Memory 记录（User/Message 表未动）`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('[clear-memory] 清理失败：', e);
    await prisma.$disconnect();
    process.exit(1);
  });
