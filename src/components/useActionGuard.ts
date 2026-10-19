import { useLayoutEffect, useRef } from 'react';

/** 畫面換了以後，這段時間（毫秒）內按下的按鈕不算數。 */
export const ACTION_GUARD_MS = 400;

/**
 * 防連點。「檢查」會在原地變成「繼續」「一步一步來」「再試一次」，換步驟時下一張卡的按鈕也在同一個位置，
 * 連點的第二下就會直接按到新的按鈕，跳過「還不對」、回饋、說明或下一張卡。
 *
 * 元件掛載後，以及每次 `resetKey` 改變後的 ACTION_GUARD_MS 內，用 `guard(action)` 包起來的按鈕
 * 不會有反應（滑鼠、觸控和鍵盤都一樣）；過了這段時間就照常運作。
 */
export function useActionGuard(resetKey?: unknown): (action: () => void) => () => void {
  const readyAt = useRef(0);
  // useLayoutEffect 在畫面更新的同一個 commit 裡執行，下一個點擊事件一定在它之後。
  useLayoutEffect(() => {
    readyAt.current = performance.now() + ACTION_GUARD_MS;
  }, [resetKey]);
  return (action) => () => {
    if (performance.now() < readyAt.current) return;
    action();
  };
}
