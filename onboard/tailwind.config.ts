import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}', // V3.0 Admin UI（components/admin + components/ui）
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /**
       * 色板走 CSS 变量（见 globals.css 的 :root 块）。
       * 变量存的是 RGB 通道（"51 65 85"）而不是完整颜色——
       * 这样 bg-cx-300/50 这类带透明度的写法才能继续生效。
       * 换肤入口已移除（2026-11-08），只保留实际有消费者的 300/400 两档。
       */
      colors: {
        cx: {
          300: 'rgb(var(--cx-300) / <alpha-value>)', // 主色（用户气泡 / 主按钮）
          400: 'rgb(var(--cx-400) / <alpha-value>)', // 主色 hover
        },
      },
      borderRadius: {
        bubble: '1.25rem',
      },
      boxShadow: {
        card: '0 8px 24px -8px rgb(var(--cx-shadow) / <alpha-value>)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .28s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
