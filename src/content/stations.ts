// 路線地圖的 7 站。課程是 lessons/ 底下的檔案，自動讀進來：新增一課只要新增一個檔案，不用改這裡。
// 檔名「站-課-英文名稱.ts」決定它在哪一站、第幾課；檔名和課程 id 對不上、課號跳號、id 重複，這裡直接拋錯：測試會失敗（部署前會跑測試），網站也打不開。
import type { Lesson, Station } from '../lib/types';
import { collectLessons } from './discover';

const STATION_TITLES = ['運動', '力與牛頓定律', '能量與動量', '波動、聲音與熱', '電與磁', '光', '近代物理'];

// 測試檔不是課程；`!` 開頭的 pattern 是排除。
// 型別寫在變數上，不要寫成 import.meta.glob<...>(：Vitest 的檔案快取只會對照字面上的「import.meta.glob(」
// 略過這個檔案，加了 <...> 就認不出來，新增或刪掉課程檔之後測試會繼續用舊的課程清單。
const modules: Record<string, { default: Lesson }> = import.meta.glob(['./lessons/*.ts', '!./lessons/*.test.ts', '!./lessons/*.spec.ts'], { eager: true });

const { byStation, problems } = collectLessons(
  modules,
  STATION_TITLES.map((_, index) => index + 1),
);
if (problems.length > 0) {
  throw new Error(`src/content/lessons/ 的課程檔有問題：\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
}

/** lessons 為空的站，地圖上顯示「即將推出」。 */
export const stations: Station[] = STATION_TITLES.map((title, index) => ({
  id: index + 1,
  title,
  lessons: byStation.get(index + 1) ?? [],
}));

const allLessons: Lesson[] = stations.flatMap((station) => station.lessons);

/** 所有課程依上課順序排列，用來判斷解鎖。 */
export const orderedLessonIds: string[] = allLessons.map((lesson) => lesson.id);

export function findLesson(id: string): Lesson | undefined {
  return allLessons.find((lesson) => lesson.id === id);
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
