// scripts/promote-admin.ts — 角色管理脚本（V3.1：支持 USER/ADMIN/DEVELOPER）
//
// ADMIN / DEVELOPER 不开放注册：唯一产生路径就是运维在服务器上跑这个脚本。
//   node --import ./scripts/ts-alias-register.mjs scripts/promote-admin.ts <email 或 userId> [角色]
// （npm run promote-admin -- <email 或 userId> [USER|ADMIN|DEVELOPER]，角色缺省 ADMIN）
//
// 权限语义：DEVELOPER 兼容 /admin 全部能力，且独占 /developer（底层配置）。
// 提权后**必须重新登录**拿新票：cx_token 是签发时快照，旧票里 role 还是旧值，
// 降到 token 自然过期前都进不了对应后台。脚本结尾会明确提示这一点。
import { normalizeRole, type UserRole } from '../lib/auth/jwt';
import { prisma } from '../lib/db';

const VALID_ROLES: UserRole[] = ['USER', 'ADMIN', 'DEVELOPER'];

async function main(): Promise<void> {
  const target = process.argv[2]?.trim();
  const roleArg = process.argv[3]?.trim().toUpperCase();

  if (!target) {
    console.error('用法：npm run promote-admin -- <email 或 userId> [USER|ADMIN|DEVELOPER]');
    console.error('例如：npm run promote-admin -- admin@example.com DEVELOPER（角色缺省 ADMIN）');
    process.exit(1);
  }
  if (roleArg && !VALID_ROLES.includes(roleArg as UserRole)) {
    console.error(`非法角色：${roleArg}（可选 ${VALID_ROLES.join(' / ')}）`);
    process.exit(1);
  }
  const targetRole: UserRole = (roleArg as UserRole) ?? 'ADMIN';

  const isEmail = target.includes('@');
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: target } : { id: target },
  });

  if (!user) {
    console.error(`找不到用户：${target}（${isEmail ? '按 email 查' : '按 userId 查'}）`);
    process.exit(1);
  }

  const current: UserRole = normalizeRole(user.role);
  if (current === targetRole) {
    console.log(`已是 ${targetRole}，无需操作：${user.id}（${user.email ?? '无邮箱'}）`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: targetRole } });
  console.log(`已改角色：${user.id}（${user.email ?? '无邮箱'}）${current} → ${targetRole}`);
  console.log(
    '⚠️ 该用户需重新登录（/api/auth/login 或 upgrade）拿新票，旧票里的 role 快照仍是旧值。',
  );
}

main()
  .catch((e) => {
    console.error('PROMOTE FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
