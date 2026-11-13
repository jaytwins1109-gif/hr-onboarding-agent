// components/admin/users-client.tsx — 用户管理（client，fetch /api/admin/users）
//
// 批次10：员工类型（employeeType）编辑——知识库可见性的数据源。
//   - 下拉 new_hire / employee，保存走 PUT /api/admin/users/:id；
//   - onboardingDate 只读展示（改日期的需求走 API，UI 保持简单，误改入职日期风险高）；
//   - 游客行只读展示（C 端游客恒 new_hire，改了不生效，后端也会 400）。
// 生效语义：employeeType 不入 JWT，C 端下一轮 /api/ai 读库即生效，无需用户重新登录。
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

interface UserRow {
  id: string;
  email: string | null;
  isGuest: boolean;
  role: string;
  employeeType: string;
  onboardingDate: string;
  createdAt: string;
  messageCount: number;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

export function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { users: UserRow[] };
      setUsers(data.users);
    } catch (e) {
      setNotice({ ok: false, text: `加载失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveType = async (id: string, employeeType: string) => {
    setSavingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeType }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, employeeType } : u)));
      setNotice({ ok: true, text: '已保存，C 端下一轮提问立即生效' });
    } catch (e) {
      setNotice({ ok: false, text: `保存失败：${e instanceof Error ? e.message : String(e)}` });
      void load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">用户管理</h1>
          <p className="mt-1 text-xs text-slate-500">
            员工类型决定 C 端可见的知识条目（employee 额外可见在职员工专属条目）； 入职满 90 天的
            new_hire 自动视为 employee。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {notice && (
        <p className={notice.ok ? 'text-sm text-emerald-600' : 'text-sm text-rose-600'}>
          {notice.text}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>员工类型</TableHead>
                <TableHead>入职时间</TableHead>
                <TableHead className="text-right">消息数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    暂无用户
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">
                    {u.email ?? u.id}
                    {u.isGuest && (
                      <Badge variant="muted" className="ml-2">
                        游客
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isGuest ? 'muted' : 'default'}>
                      {u.isGuest ? '游客' : '注册'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{u.role}</TableCell>
                  <TableCell>
                    {u.isGuest ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <select
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={u.employeeType}
                        disabled={savingId === u.id}
                        onChange={(e) => void saveType(u.id, e.target.value)}
                      >
                        <option value="new_hire">new_hire（新员工）</option>
                        <option value="employee">employee（在职员工）</option>
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {fmtDate(u.onboardingDate)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-500">
                    {u.messageCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
