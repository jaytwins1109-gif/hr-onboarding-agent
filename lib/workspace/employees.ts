// lib/workspace/employees.ts — 员工管理接口共用的纯 helper（route.ts 不能导出额外符号）

/** 员工编号即登录账号前缀：CX-0001 → cx-0001@example.com（虚构示例域名） */
export function accountFromEmployeeNo(no: string): string {
  return `${no.trim().toLowerCase()}@example.com`;
}

export function newUserId(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 批量导入统一使用的示例初始密码（虚构演示数据，正式使用前请重置） */
export const DEMO_PASSWORD = 'DemoPass12345';
