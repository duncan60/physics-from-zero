import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LessonPlayer } from './components/LessonPlayer';
import { PathMap, canOpenLesson } from './components/PathMap';
import { findLesson } from './content/stations';
import { completeLesson, displayedStreak, getStorage, loadProgress, localDayKey, saveProgress } from './lib/progress';
import type { Progress } from './lib/progress';
import { useHashRoute } from './lib/router';
import type { Route } from './lib/router';

function routeKey(route: Route): string {
  return route.name === 'lesson' ? `lesson:${route.id}` : 'map';
}

/**
 * 換頁時（第一次載入除外）：
 * - 焦點：剛才按的按鈕通常跟著舊畫面一起不見了，焦點會掉回 body。新畫面如果自己把焦點移進來了
 *   （例如上課畫面會聚焦第一個步驟），就不搶；否則把焦點移到 <main>，鍵盤和螢幕閱讀器使用者才知道換頁了。
 * - 捲回頂端。第一次載入不捲，讓瀏覽器自己還原重新整理前的位置。
 */
function useRouteChangeFocusAndScroll(key: string, main: RefObject<HTMLElement | null>): void {
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    const element = main.current;
    if (element !== null && !element.contains(document.activeElement)) element.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [key, main]);
}

function NoticeIcon(props: { kind: 'missing' | 'locked' }): React.JSX.Element {
  return (
    <svg className="notice-icon" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="var(--surface-2)" />
      {props.kind === 'locked' ? (
        <g fill="var(--text-muted)">
          <rect x="15" y="22" width="18" height="13" rx="3" />
          <path d="M18.5 22v-3.5a5.5 5.5 0 0 1 11 0V22" fill="none" stroke="var(--text-muted)" strokeWidth="3" />
        </g>
      ) : (
        <g fill="none" stroke="var(--text-muted)" strokeWidth="3.2" strokeLinecap="round">
          <path d="M18.5 18.5a5.5 5.5 0 1 1 7.6 5.1c-1.4.6-2.1 1.6-2.1 3.1v1.3" />
          <circle cx="24" cy="34" r="0.6" fill="var(--text-muted)" />
        </g>
      )}
    </svg>
  );
}

/** 找不到課程、課程還沒解鎖時的畫面：一句說明，加上「回到地圖」。 */
function Notice(props: { kind: 'missing' | 'locked'; message: string; onBack: () => void }): React.JSX.Element {
  return (
    <section className="notice">
      <NoticeIcon kind={props.kind} />
      <h2 className="notice-title">{props.message}</h2>
      <button type="button" className="button button--primary" onClick={props.onBack}>
        回到地圖
      </button>
    </section>
  );
}

export default function App(): React.JSX.Element {
  const [route, navigate] = useHashRoute();
  // 讀不到（無痕模式、被封鎖）或資料壞掉時，loadProgress 會給空進度，網站照常運作，只是不會存檔。
  const [progress, setProgress] = useState<Progress>(() => loadProgress(getStorage()));
  const mainRef = useRef<HTMLElement>(null);
  useRouteChangeFocusAndScroll(routeKey(route), mainRef);

  // 完成畫面的「回到地圖」、中途按「離開」、找不到或還沒解鎖時的「回到地圖」：取代這一筆瀏覽紀錄，
  // 不然上一頁會重新打開剛上完（或剛離開）的課。從地圖打開一課則照常新增一筆。
  const backToMap = (): void => navigate({ name: 'map' }, { replace: true });

  // 完成畫面一出現，LessonPlayer 就會呼叫這裡（只呼叫一次）：存檔、更新頁首，但不換頁，學習者還在看完成畫面。
  // 之後按「回到地圖」走 onExit；直接按上一頁或關掉分頁，進度也已經存好了。
  function finishLesson(lessonId: string, xpGained: number): void {
    const next = completeLesson(progress, lessonId, xpGained, localDayKey(new Date()));
    saveProgress(getStorage(), next); // 存不進去也沒關係，這次的進度仍然留在畫面上
    setProgress(next);
  }

  function renderPage(): React.JSX.Element {
    if (route.name === 'map') {
      return <PathMap progress={progress} onOpen={(id) => navigate({ name: 'lesson', id })} />;
    }
    const lesson = findLesson(route.id);
    if (lesson === undefined) return <Notice kind="missing" message="找不到這一課" onBack={backToMap} />;
    if (!canOpenLesson(progress, lesson.id)) {
      return <Notice kind="locked" message="這一課還沒解鎖，先完成前面的課" onBack={backToMap} />;
    }
    return <LessonPlayer lesson={lesson} onComplete={(xp) => finishLesson(lesson.id, xp)} onExit={backToMap} />;
  }

  return (
    <div className="app">
      <Header xp={progress.xp} streak={displayedStreak(progress, localDayKey(new Date()))} />
      {/* tabIndex={-1}：換頁時可以用程式把焦點移到這裡（Tab 鍵不會停在這裡） */}
      <main ref={mainRef} className="site-main" tabIndex={-1}>
        <div className="container">{renderPage()}</div>
      </main>
      <Footer />
    </div>
  );
}
