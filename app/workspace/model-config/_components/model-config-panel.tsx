'use client';

// 模型配置表单与说明卡片。
// 密钥输入框永远是空的：服务端只回一句「已加密保存，留空保留现有凭据」，从不回传明文。

import { useState } from 'react';

interface ClientConfig {
  endpoint: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  version: number;
  hasKey: boolean;
  keyHint: string;
  updatedAt: string | null;
}

interface Props {
  initial: ClientConfig;
}

interface Message {
  ok: boolean;
  text: string;
}

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600';
const BTN = 'min-h-[40px] rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60';

export function ModelConfigPanel({ initial }: Props) {
  const [config, setConfig] = useState<ClientConfig>(initial);
  const [form, setForm] = useState({
    endpoint: initial.endpoint,
    modelName: initial.modelName,
    apiKey: '',
    temperature: String(initial.temperature),
    maxTokens: String(initial.maxTokens),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/workspace/model-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        config?: ClientConfig;
      } | null;
      if (!res.ok || !data?.config) {
        setMessage({ ok: false, text: data?.error || '保存失败，请稍后再试' });
        return;
      }
      setConfig(data.config);
      setForm((prev) => ({ ...prev, apiKey: '' }));
      setMessage({ ok: true, text: `配置已保存为版本 v${data.config.version}` });
    } catch {
      setMessage({ ok: false, text: '连接不上服务，请稍后再试' });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/workspace/model-config/test', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (!res.ok && !data?.message) {
        setMessage({ ok: false, text: data?.error || '测试失败，请稍后再试' });
        return;
      }
      setMessage({
        ok: data?.ok === true,
        text: data?.message || data?.error || '没有拿到测试结果',
      });
    } catch {
      setMessage({ ok: false, text: '连接不上服务，请稍后再试' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">对话模型连接</h2>
        <p className="mt-1 text-xs text-slate-500">
          保存只影响配置，不会立刻改动员工端；回答之前一定先验证。
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            接口地址
            <input
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="https://api.example.com/v1"
              className={INPUT}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            模型名称
            <input
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              placeholder="例如 example-chat"
              className={INPUT}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密钥
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={config.keyHint || '请输入模型服务密钥'}
              autoComplete="new-password"
              className={INPUT}
            />
          </label>
          {config.hasKey && <p className="text-xs text-green-700">{config.keyHint}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              回答随机度（0 到 1，步长 0.1）
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                className={INPUT}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              单次回答最大长度（512 到 6000）
              <input
                type="number"
                min={512}
                max={6000}
                step={1}
                value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                className={INPUT}
              />
            </label>
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={`${BTN} bg-blue-700 text-white hover:bg-blue-800`}
          >
            {busy ? '正在处理…' : '保存配置'}
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={busy}
            className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            测试已保存连接
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">配置说明</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400">配置版本号</dt>
              <dd className="mt-0.5 font-semibold text-blue-700">v{config.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">验证要求</dt>
              <dd className="mt-0.5 text-slate-700">回答之前一定先验证</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">密钥存放方式</dt>
              <dd className="mt-0.5 text-slate-700">服务端加密，不向浏览器回传</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">凭据状态</dt>
              <dd className="mt-0.5 text-slate-700">{config.hasKey ? '已加密保存' : '尚未保存'}</dd>
            </div>
          </dl>
        </section>
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
          外部模型会收到员工的问题和相关制度片段；年假余额由系统直接读取，不交给模型计算。
        </p>
      </aside>
    </div>
  );
}
