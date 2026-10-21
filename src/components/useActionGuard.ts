import { useLayoutEffect, useRef, useState } from 'react';

/** 畫面換了以後，這段時間（毫秒）內按下的按鈕不算數。夠擋住連點的第二下，刻意的點擊又不用等太久。 */
export const ACTION_GUARD_MS = 250;

/** 同一張卡裡換階段後的保護期間，加在按鈕上的 class：淡色，讓人知道馬上就能按（剛掛載時的保護不加）。 */
export const GUARDED_CLASS = 'lp-button--guarded';

/** `guard(action, className)` 回傳的屬性，直接展開在 <button> 上。 */
export interface GuardedButtonProps {
  className: string;
  onClick: () => void;
  'aria-disabled': true | undefined;
}

export type Guard = (action: () => void, className: string) => GuardedButtonProps;

/**
 * 防連點。「檢查」會在原地變成「繼續」「一步一步來」「再試一次」，換步驟時下一張卡的按鈕也在同一個位置，
 * 連點的第二下就會直接按到新的按鈕，跳過「還不對」、回饋、說明或下一張卡。
 *
 * 元件掛載後，以及每次 `resetKey` 改變後的 ACTION_GUARD_MS 內，用 guard 包起來的按鈕
 * 不會有反應（滑鼠、觸控和鍵盤都一樣）；過了這段時間就照常運作。
 * - 剛掛載（一張新的卡出現）時的保護是安靜的：照樣擋住連點的第二下，但按鈕的樣子不變，
 *   每張新卡的「檢查」「繼續」不會一出現就閃一下。
 * - 同一張卡裡換階段（`resetKey` 改變，例如「檢查」變成「繼續」）時，保護期間按鈕是淡色、`aria-disabled="true"`
 *   （看得出來、念得出來還不能按），時間到自動恢復。
 * 不用 `disabled`：停用的按鈕會失去焦點，鍵盤使用者的焦點會跳走。
 *
 * 用法：`<button type="button" {...guard(onContinue, 'lp-button lp-button--primary')}>`
 */
export function useActionGuard(resetKey?: unknown): Guard {
  const readyAt = useRef(0);
  // 上一次開始保護時的 resetKey；null 代表還沒開始過（剛掛載）。
  const lastKey = useRef<{ key: unknown } | null>(null);
  const [guarded, setGuarded] = useState(false);
  // useLayoutEffect 在畫面更新的同一個 commit 裡執行，下一個點擊事件一定在它之後；
  // 這裡改的狀態也會在畫面畫出來之前生效，換了階段的按鈕一出現就是淡色。
  useLayoutEffect(() => {
    // 只有 resetKey 真的換了才變淡：剛掛載不算，StrictMode 在開發模式多跑一次 effect（key 沒變）也不算。
    const changed = lastKey.current !== null && !Object.is(lastKey.current.key, resetKey);
    lastKey.current = { key: resetKey };
    readyAt.current = performance.now() + ACTION_GUARD_MS;
    setGuarded(changed);
    // 計時器和 readyAt 同時開始、時間一樣長；時間到時也把 readyAt 提前到現在（計時器偶爾早一點點觸發也一樣），
    // 按鈕恢復正常顏色時一定按得動。卸載或換階段時清掉，不會在卸載後改狀態，也不會讓舊的計時器提早解除新的保護。
    const timer = window.setTimeout(() => {
      readyAt.current = Math.min(readyAt.current, performance.now());
      setGuarded(false);
    }, ACTION_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [resetKey]);
  return (action, className) => ({
    className: guarded ? `${className} ${GUARDED_CLASS}` : className,
    'aria-disabled': guarded || undefined,
    onClick: () => {
      if (performance.now() < readyAt.current) return;
      action();
    },
  });
}
