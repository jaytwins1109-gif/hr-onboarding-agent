// components/admin/knowledge-client.tsx — 知识库管理（client，fetch /api/admin/knowledge）
//
// 批次8（第一步）：列表 + 软删除切换（下架/恢复）。
// 批次9（第二步）：新增/编辑弹窗表单。
//   - Question / Answer 必填（前端前置校验，后端同套兜底）；
//   - Tags 逗号分隔输入，提交时转数组去空去重；
//   - Status 下拉 active/draft；
//   - 编辑复用同一弹窗：回填数据走 PUT /api/admin/knowledge/:id。
// C 端生效语义：local-workflow 每轮直连 Prisma，无缓存层，任何写操作即时生效。
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface KnowledgeRow {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  status: string;
  version: number;
  isDeleted: boolean;
  updatedAt: string;
}

const PAGE_SIZE = 20;

/** 弹窗表单状态（tags 存逗号分隔原文，提交时才转数组） */
const EMPTY_FORM = { question: '', answer: '', tags: '', status: 'active' };

export function KnowledgeClient() {
  const [items, setItems] = useState<KnowledgeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** 软删切换进行中的行 id，防连点 */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 新增/编辑共用弹窗：editing=null 表示新增
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (targetPage: number, withDeleted: boolean) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
        includeDeleted: String(withDeleted),
      });
      const res = await fetch(`/api/admin/knowledge?${qs}`);
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初始化只跑一次；includeDeleted 变化由勾选框的 onChange 直接触发 load
    void load(1, false);
  }, []);

  /** 软删除切换：下架（C 端立即不再召回）/ 恢复 */
  const onToggleDeleted = async (row: KnowledgeRow) => {
    setNotice('');
    setError('');
    setTogglingId(row.id);
    try {
      const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(row.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: !row.isDeleted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(
        row.isDeleted
          ? `「${row.question}」已恢复，C 端立即可召回`
          : `「${row.question}」已下架（软删除留痕），C 端立即不再召回`,
      );
      await load(page, includeDeleted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingId(null);
    }
  };

  /** 打开弹窗：row 为空 = 新增；否则回填编辑 */
  const openModal = (row: KnowledgeRow | null) => {
    setEditing(row);
    setFormError('');
    setForm(
      row
        ? { question: row.question, answer: row.answer, tags: row.tags.join(', '), status: row.status }
        : EMPTY_FORM,
    );
    setModalOpen(true);
  };

  /** 新增/编辑提交：Tags 逗号转数组；编辑走 PUT（内容变更 version 自动 +1） */
  const submitForm = async () => {
    setFormError('');
    const question = form.question.trim();
    const answer = form.answer.trim();
    if (!question || !answer) {
      setFormError('Question 和 Answer 都是必填');
      return;
    }
    if (form.status !== 'active' && form.status !== 'draft') {
      setFormError('Status 只能是 active 或 draft');
      return;
    }
    // 逗号分隔 → 数组：兼容英文 `,` 与中文 `，`；去空白、去空项、去重
    const tags = [...new Set(form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean))];

    setSubmitting(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/knowledge/${encodeURIComponent(editing.id)}` : '/api/admin/knowledge',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, tags, status: form.status }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(
        editing
          ? `「${question}」已更新（版本 v${editing.version} → v${data.item.version}），C 端立即生效`
          : `「${question}」已创建，C 端立即可召回`,
      );
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      await load(page, includeDeleted);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">知识库管理</h1>
          <p className="text-xs text-slate-400">
            HR FAQ 条目维护 · 写操作即时生效（检索链路直连库，无缓存层）· 软删除留痕可恢复
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => {
                setIncludeDeleted(e.target.checked);
                void load(1, e.target.checked);
              }}
              className="h-3.5 w-3.5 rounded accent-sky-600"
            />
            显示已删除
          </label>
          <Button size="sm" variant="outline" onClick={() => void load(page, includeDeleted)} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => openModal(null)}
          >
            <Plus className="h-4 w-4" />
            新增条目
          </Button>
        </div>
      </div>

      {notice && <p className="text-xs text-emerald-600">{notice}</p>}
      {error && <p className="text-xs text-rose-600">出错：{error}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">问题</TableHead>
                <TableHead>答案</TableHead>
                <TableHead className="w-40">标签</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-16 text-right">版本</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : !loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    暂无条目，点右上角「新增条目」创建第一条 FAQ
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id} className={row.isDeleted ? 'opacity-60' : undefined}>
                    <TableCell className="text-sm font-medium text-slate-700">
                      {row.question}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-slate-500">
                      {row.answer}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.tags.length === 0 ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          row.tags.map((t) => (
                            <Badge key={t} variant="muted">
                              {t}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.isDeleted ? (
                        <Badge variant="warning">已删除</Badge>
                      ) : (
                        <Badge variant={row.status === 'active' ? 'success' : 'muted'}>
                          {row.status === 'active' ? 'active' : 'draft'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-slate-400">
                      v{row.version}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onToggleDeleted(row)}
                          disabled={togglingId === row.id}
                        >
                          {row.isDeleted ? '恢复' : '下架'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openModal(row)}
                          disabled={togglingId === row.id}
                        >
                          编辑
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            共 {total} 条 · 第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1, includeDeleted)}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => void load(page + 1, includeDeleted)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗：editing 区分模式 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑知识条目' : '新增知识条目'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `正在编辑 ${editing.id} · 内容变更后版本自动 +1（当前 v${editing.version}），保存后 C 端立即生效`
                : '保存后 C 端立即可召回；Tags 用英文逗号分隔，留空则不带标签'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-500">Question（问题）· 必填</span>
              <Input
                placeholder="如：入职需要准备哪些材料？"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-500">Answer（答案）· 必填</span>
              <textarea
                rows={4}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                placeholder="HR 确认口径的完整答案；建议附上「以 HR 通知为准」"
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-[1fr_9rem] gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-500">Tags（标签，中英文逗号分隔）</span>
                <Input
                  placeholder="如：入职材料，新员工, 报到"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-500">Status</span>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="active">active（上架）</option>
                  <option value="draft">draft（草稿，C 端不召回）</option>
                </select>
              </label>
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void submitForm()} disabled={submitting}>
              {submitting ? '保存中…' : editing ? '保存更新' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
