import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LessonPlayer } from './components/LessonPlayer';
import type { LessonResult } from './components/LessonPlayer';
import { PathMap, canOpenLesson } from './components/PathMap';
import { SoundProvider } from './components/SoundContext';
import { findLesson } from './content/stations';
import {
  STORAGE_KEY,
  completeLesson,
  displayedStreak,
  getStorage,
  loadProgress,
  localDayKey,
  mergeProgress,
  saveProgress,
  setSoundOn,
} from './lib/progress';
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

  // 同時開了好幾個分頁：別的分頁存了進度，瀏覽器會在這個分頁發出 storage 事件（寫入的分頁自己收不到）。
  // 合併進來，頁首和地圖跟著更新。合併只會增加不會減少，所以別處清掉儲存空間也不會讓畫面上的進度消失。
  // 音效開關沒有「增加」可言：存進去的是別的分頁剛選的，照著改（儲存空間被清掉時沒有人選過，維持這個分頁的設定）。
  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== STORAGE_KEY) return;
      const stored = loadProgress(getStorage());
      const chosenElsewhere = event.newValue !== null;
      setProgress((current) => {
        const merged = mergeProgress(current, stored);
        return chosenElsewhere ? setSoundOn(merged, stored.soundOn) : merged;
      });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 完成畫面的「回到地圖」、中途按「離開」、找不到或還沒解鎖時的「回到地圖」：取代這一筆瀏覽紀錄，
  // 不然上一頁會重新打開剛上完（或剛離開）的課。從地圖打開一課則照常新增一筆。
  const backToMap = (): void => navigate({ name: 'map' }, { replace: true });

  // 完成畫面一出現，LessonPlayer 就會呼叫這裡（只呼叫一次）：存檔、更新頁首，但不換頁，學習者還在看完成畫面。
  // 之後按「回到地圖」走 onExit；直接按上一頁或關掉分頁，進度也已經存好了。
  // 存檔前先和儲存空間裡最新的進度合併：分頁在背景被凍結時可能沒收到 storage 事件，
  // 直接用這個分頁記得的舊進度存檔，會蓋掉別的分頁這段時間完成的課和 XP。
  // 合併而不是直接改用讀回來的：存不進去（空間滿了）時，讀回來的是空的，這個分頁記得的進度不能丟。
  function finishLesson(lessonId: string, result: LessonResult): void {
    const storage = getStorage();
    const latest = mergeProgress(progress, loadProgress(storage));
    const next = completeLesson(latest, lessonId, result.xp, localDayKey(new Date()), result.perfect);
    saveProgress(storage, next); // 存不進去也沒關係，這次的進度仍然留在畫面上
    setProgress(next);
  }

  // 頁首的音效開關：立刻生效並記住。和 finishLesson 一樣先和儲存空間裡最新的進度合併再存，
  // 沒收到 storage 事件的舊分頁切換音效，才不會蓋掉別的分頁完成的課和 XP。儲存空間不能用時，只在這個分頁切換。
  function toggleSound(): void {
    const storage = getStorage();
    const latest = mergeProgress(progress, loadProgress(storage));
    const next = setSoundOn(latest, !progress.soundOn);
    saveProgress(storage, next);
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
    return <LessonPlayer lesson={lesson} onComplete={(result) => finishLesson(lesson.id, result)} onExit={backToMap} />;
  }

  return (
    <SoundProvider enabled={progress.soundOn}>
      <div className="app">
        <Header
          xp={progress.xp}
          streak={displayedStreak(progress, localDayKey(new Date()))}
          soundOn={progress.soundOn}
          onToggleSound={toggleSound}
        />
        {/* tabIndex={-1}：換頁時可以用程式把焦點移到這裡（Tab 鍵不會停在這裡） */}
        <main ref={mainRef} className="site-main" tabIndex={-1}>
          <div className="container">{renderPage()}</div>
        </main>
        <Footer />
      </div>
    </SoundProvider>
  );
}
