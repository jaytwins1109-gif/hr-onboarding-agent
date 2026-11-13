// app/admin/products/page.tsx — 知识库管理页
// 路径保留 /admin/products（侧边栏与既有入口不变），实际管理对象是知识库条目 KnowledgeItem。
import { redirect } from 'next/navigation';
import { isAdminPageAuthed } from '@/lib/admin/page-auth';
import { KnowledgeClient } from '@/components/admin/knowledge-client';

export const metadata = { title: '知识库管理 · 小初管理后台' };

export default async function AdminKnowledgePage() {
  if (!(await isAdminPageAuthed())) redirect('/');
  return <KnowledgeClient />;
}
