import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/physics-from-zero/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // 其他工具會把 git worktree 放在 .claude/ 和 .superpowers/ 底下，不要掃到裡面的測試。
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**'],
  },
});
