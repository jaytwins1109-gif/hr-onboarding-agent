// app/admin/users/page.tsx — 用户管理页（批次10 新增）
// 与 /admin/messages 同构：仅做壳，数据交互在 users-client。
import { UsersClient } from '@/components/admin/users-client';

export const metadata = {
  title: '用户管理 - 小初管理后台',
};

export default function AdminUsersPage() {
  return <UsersClient />;
}
