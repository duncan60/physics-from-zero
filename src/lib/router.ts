import { useCallback, useEffect, useState } from 'react';

// Hash 路由：`#/` 是地圖，`#/lesson/1-2` 是一課，`#/review/1` 是第 1 站的重點總結（複習本身是一課：`#/lesson/review-1`）。
// 用 hash 才能在 GitHub Pages 的子路徑底下重新整理頁面（伺服器只看得到 /physics-from-zero/）。

export type Route = { name: 'map' } | { name: 'lesson'; id: string } | { name: 'review'; stationId: number };

const LESSON_HASH = /^#\/lesson\/([^/?#]+)$/;
// 站號是正整數，不接受 0 開頭（'#/review/01' 和 '#/review/1' 不會變成兩個網址）。
const REVIEW_HASH = /^#\/review\/([1-9][0-9]*)$/;

/**
 * '#/lesson/1-2' → 那一課；'#/review/1' → 第 1 站的重點總結；
 * 其他情況（空白、'#/'、看不懂的網址、壞掉的編碼）一律回傳地圖。
 */
export function parseHash(hash: string): Route {
  const review = REVIEW_HASH.exec(hash);
  if (review !== null) return { name: 'review', stationId: Number(review[1]) };
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
