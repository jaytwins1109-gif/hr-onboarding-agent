// lib/workspace/policies.ts
//
// 制度知识库的常量与「唯一一套可见性规则」（文档第 9 步第 5 条）：
// 列表、详情、下载、以及之后的智能问答都必须调用 canViewPolicy，不许各写各的。

export const POLICY_CATEGORIES = [
  '公司制度',
  '入职指南',
  '报销制度',
  '请假制度',
  '部门制度',
  '福利保障',
] as const;

export const POLICY_STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  parsing: '解析中',
  pending: '待发布',
  published: '已发布',
  failed: '失败',
  archived: '已下架',
};

export interface PolicyVisibilityFields {
  status: string;
  effectiveDate: string;
  scope: string;
}

/** 今天的北京时间日期（YYYY-MM-DD），与生效日期字符串可直接比较 */
export function todayInChina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * 员工能否看到这份制度：已发布 + 生效日期不晚于今天 + 适用全员或本人部门。
 * 部门为 null 的员工只能看全员制度。管理员后台列表不走这里（要看全部状态）。
 */
export function canViewPolicy(
  policy: PolicyVisibilityFields,
  department: string | null,
  now: Date = new Date(),
): boolean {
  if (policy.status !== 'published') return false;
  if (policy.effectiveDate > todayInChina(now)) return false;
  if (policy.scope === 'all') return true;
  return !!department && policy.scope === department;
}

export function scopeLabel(scope: string): string {
  return scope === 'all' ? '全员可见' : `${scope}专属`;
}
