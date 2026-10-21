import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LessonPlayer } from './components/LessonPlayer';
import type { LessonResult } from './components/LessonPlayer';
import { PathMap, canOpenLesson, canOpenReview } from './components/PathMap';
import { PreviewBanner, PreviewPage } from './components/PreviewPage';
import { SoundProvider } from './components/SoundContext';
import { StationSummary } from './components/StationSummary';
import { findLesson, isLastLessonOfStation, reviewLessonId, reviewOf, reviewStationOf, stationOf, stations } from './content/stations';
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
  switch (route.name) {
    case 'map':
      return 'map';
    case 'lesson':
      return `lesson:${route.id}`;
    case 'review':
      return `review:${route.stationId}`;
    case 'preview':
      return 'preview';
    case 'preview-run':
      return `preview-run:${route.lessonId}:${route.step}`;
  }
}

/** 預覽時上完一課的回報：什麼都不存（不記進度、不加 XP），學習者留在完成畫面，按「回到地圖」才回預覽頁。 */
function ignoreResult(): void {}

// 本站重點與複習（總結頁、複習）還沒解鎖時的說明。
const REVIEW_LOCKED = '本站重點與複習還沒解鎖，先完成這一站的每一課';

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

/** 找不到課程、課程還沒解鎖（本站重點也一樣）時的畫面：一句說明，加上「回到地圖」（預覽頁的是「回到預覽頁」）。 */
function Notice(props: { kind: 'missing' | 'locked'; message: string; onBack: () => void; backLabel?: string }): React.JSX.Element {
  return (
    <section className="notice">
      <NoticeIcon kind={props.kind} />
      <h2 className="notice-title">{props.message}</h2>
      <button type="button" className="button button--primary" onClick={props.onBack}>
        {props.backLabel ?? '回到地圖'}
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

  /**
   * 上完一站的最後一課時，完成畫面的「看本站重點」：這一站要有重點與複習，而且已經打得開（每一課都上完了；
   * 完成畫面一出現就存檔，所以剛上完的這一課也算）。和「回到地圖」一樣取代這一筆瀏覽紀錄，上一頁不會重新打開剛上完的課。
   * 其他情況回傳 undefined，完成畫面就沒有這個按鈕。
   */
  function stationSummaryAfter(lessonId: string): (() => void) | undefined {
    const stationId = stationOf(lessonId);
    if (stationId === undefined || !isLastLessonOfStation(lessonId) || reviewOf(stationId) === undefined) return undefined;
    if (!canOpenReview(progress, stationId)) return undefined;
    return () => navigate({ name: 'review', stationId }, { replace: true });
  }

  /** #/review/站號：這一站的重點總結；「開始複習」打開複習（新增一筆瀏覽紀錄，上一頁回到總結頁）。 */
  function renderSummary(stationId: number): React.JSX.Element {
    const review = reviewOf(stationId);
    const station = stations.find((s) => s.id === stationId);
    if (review === undefined || station === undefined) return <Notice kind="missing" message="找不到這一站的重點" onBack={backToMap} />;
    if (!canOpenReview(progress, stationId)) return <Notice kind="locked" message={REVIEW_LOCKED} onBack={backToMap} />;
    return (
      <StationSummary
        review={review}
        stationTitle={station.title}
        onStart={() => navigate({ name: 'lesson', id: reviewLessonId(stationId) })}
        onBack={backToMap}
      />
    );
  }

  /**
   * 本機預覽頁（只在開發模式，見下面 renderPage 的 import.meta.env.DEV）：從任何一課（或複習）的任何一步開始上課。
   * 不檢查解鎖，不呼叫 saveProgress／completeLesson、不碰 localStorage，也沒有「回報問題」連結（不從 localhost 開 issue）；
   * 完成畫面的「回到地圖」和中途「離開」都只回預覽頁。步驟編號從 1 算起，上課畫面的 startAt 從 0 算起。
   */
  function renderPreviewRun(lessonId: string, step: number): React.JSX.Element {
    const backToPreview = (): void => navigate({ name: 'preview' }, { replace: true });
    const lesson = findLesson(lessonId);
    if (lesson === undefined || step > lesson.steps.length) {
      return <Notice kind="missing" message="找不到這一步" backLabel="回到預覽頁" onBack={backToPreview} />;
    }
    return (
      <>
        <PreviewBanner />
        <LessonPlayer
          lesson={lesson}
          startAt={step - 1}
          onComplete={ignoreResult}
          onExit={backToPreview}
          showReportLinks={false}
          isReview={reviewStationOf(lesson.id) !== undefined}
        />
      </>
    );
  }

  function renderPage(): React.JSX.Element {
    if (route.name === 'review') return renderSummary(route.stationId);
    // 只有開發模式：正式建置時 import.meta.env.DEV 是 false，Vite 會把這一段連同 PreviewPage 一起移除
    // （parseHash 在正式網站也不會給出預覽的路由）。
    if (import.meta.env.DEV) {
      if (route.name === 'preview') {
        return <PreviewPage onStart={(lessonId, step) => navigate({ name: 'preview-run', lessonId, step })} onBack={backToMap} />;
      }
      if (route.name === 'preview-run') return renderPreviewRun(route.lessonId, route.step);
    }
    if (route.name !== 'lesson') return <PathMap progress={progress} onOpen={(next) => navigate(next)} />;
    // 一課，或某一站的複習（review-站號）：複習和課程一樣上課、存進度，只是解鎖規則不同（canOpenLesson 會處理）。
    const lesson = findLesson(route.id);
    if (lesson === undefined) return <Notice kind="missing" message="找不到這一課" onBack={backToMap} />;
    const isReview = reviewStationOf(lesson.id) !== undefined;
    if (!canOpenLesson(progress, lesson.id)) {
      const message = isReview ? REVIEW_LOCKED : '這一課還沒解鎖，先完成前面的課';
      return <Notice kind="locked" message={message} onBack={backToMap} />;
    }
    return (
      <LessonPlayer
        lesson={lesson}
        onComplete={(result) => finishLesson(lesson.id, result)}
        onExit={backToMap}
        onShowStationSummary={stationSummaryAfter(lesson.id)}
        isReview={isReview}
      />
    );
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
