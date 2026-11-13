// app/admin/memories/page.tsx — 记忆管理已下线（2026-11-07 换血）
//
// 记忆/偏好功能随旧业务退役，HR 助理不读 memory，页面本身没有可展示的数据。
// 保留文件只为避免侧栏/书签/历史链接打到 404 死链：访问一律落到数据看板。
import { redirect } from 'next/navigation';

export default function AdminMemoriesPage() {
  redirect('/admin');
}
