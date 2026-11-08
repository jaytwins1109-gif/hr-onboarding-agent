// lib/auth/knowledge-role.ts
//
// 知识角色映射（2026-11-08 批次10）。auth 角色（USER/ADMIN）与知识角色
// （new_hire/employee）是两个正交维度：前者管"能进哪扇门"，后者管
// "门口的告示给谁看"（KnowledgeItem.allowedRoles）。
//
// 设计要点（批次10 拍板）：
//   1. employeeType **不入 JWT**——转正/调整必须立即生效，不走 30 天 token 快照；
//      每次 /api/ai 请求读库拿最新值（AI 路由本来就要碰 User 表，成本可忽略）。
//   2. 按 onboardingDate 自动"转正"：入库 ≤90 天算 new_hire，超了自动升 employee。
//      显式设过 employeeType='employee' 的直接生效；Admin 想把人留在新员工期，
//      改 onboardingDate 即可（字段即开关）。
//   3. ADMIN 管理员全可见（预览所有视角）；游客恒 new_hire（不经过本文件，
//      AI 路由直接按 'new_hire' 传，见 app/api/ai 的接线注释）。

/** 新员工自动转正窗口（天） */
export const NEW_HIRE_WINDOW_DAYS = 90;

export type KnowledgeRole = 'new_hire' | 'employee' | 'admin';

import { prisma } from '@/lib/db';

export interface KnowledgeRoleInput {
  employeeType?: string | null;
  onboardingDate?: Date | null;
  /** auth 角色（JWT 快照）：ADMIN 全可见 */
  role?: string | null;
}

/**
 * User 行（employeeType / onboardingDate / role）→ canAccessKnowledgeItem 的角色参数。
 * 任何脏值（未知 employeeType / 缺日期）按最保守处理：留在 new_hire。
 */
export function mapKnowledgeRole(user: KnowledgeRoleInput): KnowledgeRole {
  if (user.role === 'ADMIN') return 'admin';
  if (user.employeeType === 'employee') return 'employee';

  if (user.onboardingDate instanceof Date && !Number.isNaN(user.onboardingDate.getTime())) {
    const days = (Date.now() - user.onboardingDate.getTime()) / 86_400_000;
    if (days > NEW_HIRE_WINDOW_DAYS) return 'employee';
  }
  return 'new_hire';
}

/**
 * /api/ai 每次请求的实时映射：按 userId 读库拿最新 employeeType / onboardingDate。
 * 为什么不走 JWT 快照：转正必须立即生效（与 role 快照的降权窗口决策相反，见文件头）。
 * 用户行不存在（理论不可能：登录必有行，日志 upsert 也补过）→ 最保守按 new_hire。
 */
export async function resolveKnowledgeRole(
  userId: string,
  authRole?: string | null,
): Promise<KnowledgeRole> {
  if (authRole === 'ADMIN') return 'admin';
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeType: true, onboardingDate: true, role: true },
  });
  return user ? mapKnowledgeRole(user) : 'new_hire';
}
