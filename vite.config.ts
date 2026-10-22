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
    // Vitest 預設把 CSS 換成空字串；只有用 ?raw 讀文字的 CSS（styles.test.ts）照 Vite 的方式讀進來。
    css: { include: [/\.css\?raw$/] },
  },
});
