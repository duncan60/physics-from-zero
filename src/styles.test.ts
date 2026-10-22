import { expect, it } from 'vitest';
import styles from './styles.css?raw';

// jsdom 不會套用樣式表，畫面測試看不出 hidden 的元素有沒有真的藏起來，所以直接檢查 styles.css 的文字。
// 瀏覽器內建的 [hidden] { display: none } 會被 .lp-resume 這類 display: flex 的樣式蓋掉，要用 !important 蓋回來。
it('styles.css 有 [hidden] { display: none !important; }：有 hidden 屬性的元素一定不顯示', () => {
  expect(styles).toMatch(/(^|\n)\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
