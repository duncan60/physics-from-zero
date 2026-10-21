// 路線地圖的 7 站。課程是 lessons/ 底下的檔案，自動讀進來：新增一課只要新增一個檔案，不用改這裡。
// 檔名「站-課-英文名稱.ts」決定它在哪一站、第幾課；檔名和課程 id 對不上、課號跳號、id 重複，這裡直接拋錯：測試會失敗（部署前會跑測試），網站也打不開。
// 每站的重點總結與複習是 reviews/ 底下的檔案「站號-英文名稱.ts」，一樣自動讀進來、有問題就拋錯。
import type { Lesson, Station, StationReview } from '../lib/types';
import { collectLessons, collectReviews } from './discover';

const STATION_TITLES = ['運動', '力與牛頓定律', '能量與動量', '波動、聲音與熱', '電與磁', '光', '近代物理'];

// 測試檔不是課程；`!` 開頭的 pattern 是排除。
// 型別寫在變數上，不要寫成 import.meta.glob<...>(：Vitest 的檔案快取只會對照字面上的「import.meta.glob(」
// 略過這個檔案，加了 <...> 就認不出來，新增或刪掉課程檔之後測試會繼續用舊的課程清單。
const modules: Record<string, { default: Lesson }> = import.meta.glob(['./lessons/*.ts', '!./lessons/*.test.ts', '!./lessons/*.spec.ts'], { eager: true });

const STATION_IDS = STATION_TITLES.map((_, index) => index + 1);

const { byStation, problems } = collectLessons(modules, STATION_IDS);
if (problems.length > 0) {
  throw new Error(`src/content/lessons/ 的課程檔有問題：\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
}

// 和上面的課程一樣：型別寫在變數上，保持字面上的「import.meta.glob(」。
const reviewModules: Record<string, { default: StationReview }> = import.meta.glob(['./reviews/*.ts', '!./reviews/*.test.ts', '!./reviews/*.spec.ts'], { eager: true });

const { byStation: reviewByStation, problems: reviewProblems } = collectReviews(reviewModules, STATION_IDS);
if (reviewProblems.length > 0) {
  throw new Error(`src/content/reviews/ 的複習檔有問題：\n${reviewProblems.map((problem) => `- ${problem}`).join('\n')}`);
}

/** lessons 為空的站，地圖上顯示「即將推出」。 */
export const stations: Station[] = STATION_TITLES.map((title, index) => ({
  id: index + 1,
  title,
  lessons: byStation.get(index + 1) ?? [],
}));

const allLessons: Lesson[] = stations.flatMap((station) => station.lessons);

/** 所有課程依上課順序排列，用來判斷解鎖。不包含每站的複習：做不做複習，都不影響下一課解鎖。 */
export const orderedLessonIds: string[] = allLessons.map((lesson) => lesson.id);

/** 這一站的重點總結與複習；這一站沒有複習（或沒有這一站）就是 undefined。 */
export function reviewOf(stationId: number): StationReview | undefined {
  return reviewByStation.get(stationId);
}

/** 複習當成一課時的 id，例如第 1 站是 'review-1'。完成與完美記在進度的 completed／perfect 裡，和課程一樣。 */
export function reviewLessonId(stationId: number): string {
  return `review-${stationId}`;
}

/** 把複習題包裝成一課，交給上課畫面：id 是 review-站號，標題是「第 N 站複習」。 */
export function reviewAsLesson(review: StationReview): Lesson {
  return { id: reviewLessonId(review.stationId), title: `第 ${review.stationId} 站複習`, steps: review.steps };
}

// 先包裝好，findLesson 每次回傳同一個物件。
const reviewLessons: Lesson[] = STATION_IDS.flatMap((id) => {
  const review = reviewOf(id);
  return review === undefined ? [] : [reviewAsLesson(review)];
});

/** 'review-1' → 1：這個 id 是第幾站的複習。一般的課、不存在的複習，都是 undefined。 */
export function reviewStationOf(lessonId: string): number | undefined {
  return STATION_IDS.find((id) => reviewOf(id) !== undefined && reviewLessonId(id) === lessonId);
}

/** 用 id 找課程；每站的複習（review-站號）也找得到。 */
export function findLesson(id: string): Lesson | undefined {
  return allLessons.find((lesson) => lesson.id === id) ?? reviewLessons.find((lesson) => lesson.id === id);
}

/** 這一課在第幾站；找不到這一課就是 undefined。 */
export function stationOf(lessonId: string): number | undefined {
  return stations.find((station) => station.lessons.some((lesson) => lesson.id === lessonId))?.id;
}

/** 這一課是不是它那一站的最後一課；找不到這一課也是 false。 */
export function isLastLessonOfStation(lessonId: string): boolean {
  const station = stations.find((s) => s.lessons.some((lesson) => lesson.id === lessonId));
  return station?.lessons[station.lessons.length - 1].id === lessonId;
}
