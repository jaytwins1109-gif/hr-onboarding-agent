// components/admin/knowledge-client.tsx — 知识库管理（client，fetch /api/admin/knowledge）
//
// 本轮（2026-11-08 批次8）只做：列表 + 软删除切换（下架/恢复）。
// 新增 / 编辑表单第二步上线——「编辑」按钮先渲染为禁用态占位。
// C 端生效语义：local-workflow 每轮直连 Prisma，无缓存层，切换即时生效。
'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

  const load = useCallback(
    async (targetPage: number, withDeleted: boolean) => {
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
    },
    [],
  );

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">知识库管理</h1>
          <p className="text-xs text-slate-400">
            HR FAQ 条目维护 · 下架/恢复即时生效（检索链路直连库，无缓存层）· 新增/编辑表单第二步上线
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
                    暂无条目（种子 FAQ 由 prisma/seed.ts 写入）
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
                        <Button size="sm" variant="ghost" disabled title="编辑表单第二步上线">
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
    </div>
  );
}
