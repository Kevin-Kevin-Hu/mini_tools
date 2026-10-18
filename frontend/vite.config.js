import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发时前端跑在 5173，/api 代理到后端 8000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  // 构建产物直接输出给后端托管，这样线上是"一个 Python 服务 = 一个端口"
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
})
