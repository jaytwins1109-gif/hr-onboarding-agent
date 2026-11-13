import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '小初 · 新员工入职咨询助理',
  description: '新员工入职常见问题咨询：材料、流程、报到与对接人',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#334155',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
