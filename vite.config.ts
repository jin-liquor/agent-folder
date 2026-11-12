import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  build: {
    target: "es2021",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    // 只跑本项目源码下的测试。
    // 不限定 include 时 vitest 会连 node_modules 里的 .test.ts 一起收集，
    // 那些是第三方包自带的 TypeScript 源码，esbuild 直接解析会报错。
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "src-tauri/**", "dist/**"],
    environment: "node",
  },
});
