import { useCallback, useEffect, useState } from 'react';

// Hash 路由：`#/` 是地圖，`#/lesson/1-2` 是一課。
// 用 hash 才能在 GitHub Pages 的子路徑底下重新整理頁面（伺服器只看得到 /physics-from-zero/）。

export type Route = { name: 'map' } | { name: 'lesson'; id: string };

const LESSON_HASH = /^#\/lesson\/([^/?#]+)$/;

/** '#/lesson/1-2' → 那一課；其他情況（空白、'#/'、看不懂的網址、壞掉的編碼）一律回傳地圖。 */
export function parseHash(hash: string): Route {
  const match = LESSON_HASH.exec(hash);
  if (match === null) return { name: 'map' };
  try {
    return { name: 'lesson', id: decodeURIComponent(match[1]) };
  } catch {
    return { name: 'map' };
  }
}

export function routeToHash(route: Route): string {
  return route.name === 'lesson' ? `#/lesson/${encodeURIComponent(route.id)}` : '#/';
}

function sameRoute(a: Route, b: Route): boolean {
  return a.name === b.name && (a.name === 'map' || (b.name === 'lesson' && a.id === b.id));
}

/**
 * 目前的路由，以及切換路由的函式。切換時會改網址的 hash（會留下瀏覽紀錄，上一頁可以回去），
 * 瀏覽器的上一頁、下一頁或手動改網址，也會透過 hashchange 更新畫面。
 */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    // 每次都重新讀網址，不用事件裡的 newURL，晚到的事件也不會把畫面切錯。
    const sync = (): void => {
      const next = parseHash(window.location.hash);
      setRoute((current) => (sameRoute(current, next) ? current : next));
    };
    window.addEventListener('hashchange', sync);
    sync(); // 第一次畫面到掛上監聽之間，網址可能已經變了
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((next: Route) => {
    if (!sameRoute(parseHash(window.location.hash), next)) window.location.hash = routeToHash(next);
    // 不等 hashchange（它是非同步的），畫面立刻換。
    setRoute((current) => (sameRoute(current, next) ? current : next));
  }, []);

  return [route, navigate];
}
