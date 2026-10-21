import { useCallback, useEffect, useState } from 'react';

// Hash 路由：`#/` 是地圖，`#/lesson/1-2` 是一課，`#/review/1` 是第 1 站的重點總結（複習本身是一課：`#/lesson/review-1`）。
// 用 hash 才能在 GitHub Pages 的子路徑底下重新整理頁面（伺服器只看得到 /physics-from-zero/）。
// 開發模式（import.meta.env.DEV）另外有本機預覽：`#/preview` 列出每一課每一步，`#/preview/1-3/4` 從 1-3 的第 4 步開始上課
// （步驟從 1 算起，和預覽頁上看到的編號一樣；課程 id 也可以是 review-1）。正式網站沒有這兩個路由，網址一律當作地圖。

export type Route =
  | { name: 'map' }
  | { name: 'lesson'; id: string }
  | { name: 'review'; stationId: number }
  | { name: 'preview' }
  /** step 從 1 算起（網址上的步驟編號）；上課畫面的 startAt 從 0 算起，所以是 step - 1。 */
  | { name: 'preview-run'; lessonId: string; step: number };

const LESSON_HASH = /^#\/lesson\/([^/?#]+)$/;
// 站號是正整數，不接受 0 開頭（'#/review/01' 和 '#/review/1' 不會變成兩個網址）。
const REVIEW_HASH = /^#\/review\/([1-9][0-9]*)$/;
const PREVIEW_HASH = '#/preview';
// 步驟從 1 算起，不接受 0 開頭（同一步只有一個網址）。
const PREVIEW_RUN_HASH = /^#\/preview\/([^/?#]+)\/([1-9][0-9]*)$/;

/** 預覽頁的網址（#/preview、#/preview/課程/步驟）；不是預覽的網址，或看不懂，回傳 null。 */
function parsePreviewHash(hash: string): Route | null {
  if (hash === PREVIEW_HASH) return { name: 'preview' };
  const run = PREVIEW_RUN_HASH.exec(hash);
  if (run === null) return null;
  try {
    return { name: 'preview-run', lessonId: decodeURIComponent(run[1]), step: Number(run[2]) };
  } catch {
    return null;
  }
}

/**
 * '#/lesson/1-2' → 那一課；'#/review/1' → 第 1 站的重點總結；
 * '#/preview'、'#/preview/1-3/4' → 本機預覽，只有 `dev` 是 true 才認得（預設是 import.meta.env.DEV：正式建置是 false）；
 * 其他情況（空白、'#/'、看不懂的網址、壞掉的編碼、正式網站上的預覽網址）一律回傳地圖。
 * `dev` 參數讓測試可以兩種都試。
 */
export function parseHash(hash: string, dev: boolean = import.meta.env.DEV): Route {
  const review = REVIEW_HASH.exec(hash);
  if (review !== null) return { name: 'review', stationId: Number(review[1]) };
  if (dev) {
    const preview = parsePreviewHash(hash);
    if (preview !== null) return preview;
  }
  const match = LESSON_HASH.exec(hash);
  if (match === null) return { name: 'map' };
  try {
    return { name: 'lesson', id: decodeURIComponent(match[1]) };
  } catch {
    return { name: 'map' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'map':
      return '#/';
    case 'lesson':
      return `#/lesson/${encodeURIComponent(route.id)}`;
    case 'review':
      return `#/review/${route.stationId}`;
    case 'preview':
      return PREVIEW_HASH;
    case 'preview-run':
      return `${PREVIEW_HASH}/${encodeURIComponent(route.lessonId)}/${route.step}`;
  }
}

/** 網址一樣，就是同一頁。 */
function sameRoute(a: Route, b: Route): boolean {
  return routeToHash(a) === routeToHash(b);
}

export interface NavigateOptions {
  /** true：取代目前這一筆瀏覽紀錄，不新增一筆（上一頁不會回到換頁前的畫面）。 */
  replace?: boolean;
}

/**
 * 目前的路由，以及切換路由的函式。切換時會改網址的 hash：預設新增一筆瀏覽紀錄（上一頁可以回去），
 * `{ replace: true }` 則取代目前這一筆。瀏覽器的上一頁、下一頁或手動改網址，也會透過 hashchange／popstate 更新畫面。
 */
export function useHashRoute(): [Route, (r: Route, options?: NavigateOptions) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    // 每次都重新讀網址，不用事件裡的 newURL，晚到的事件也不會把畫面切錯。
    const sync = (): void => {
      const next = parseHash(window.location.hash);
      setRoute((current) => (sameRoute(current, next) ? current : next));
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    sync(); // 第一次畫面到掛上監聽之間，網址可能已經變了
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((next: Route, options?: NavigateOptions) => {
    if (!sameRoute(parseHash(window.location.hash), next)) {
      const hash = routeToHash(next);
      // replaceState 不會觸發 hashchange；下面直接更新畫面。
      if (options?.replace === true) window.history.replaceState(window.history.state, '', hash);
      else window.location.hash = hash;
    }
    // 不等 hashchange（它是非同步的），畫面立刻換。
    setRoute((current) => (sameRoute(current, next) ? current : next));
  }, []);

  return [route, navigate];
}
