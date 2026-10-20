// 路線地圖的 7 站。新增一課：在 lessons/ 新增檔案，再加進對應那一站的 lessons。
import type { Lesson, Station } from '../lib/types';
import { inertia } from './lessons/1-1-inertia';
import { speedPosition } from './lessons/1-2-speed-position';
import { acceleration } from './lessons/1-3-acceleration';
import { ballThrownUp } from './lessons/1-4-ball-thrown-up';
import { howHigh } from './lessons/1-5-how-high';

/** lessons 為空的站，地圖上顯示「即將推出」。 */
export const stations: Station[] = [
  { id: 1, title: '運動', lessons: [inertia, speedPosition, acceleration, ballThrownUp, howHigh] },
  { id: 2, title: '力與牛頓定律', lessons: [] },
  { id: 3, title: '能量與動量', lessons: [] },
  { id: 4, title: '波動、聲音與熱', lessons: [] },
  { id: 5, title: '電與磁', lessons: [] },
  { id: 6, title: '光', lessons: [] },
  { id: 7, title: '近代物理', lessons: [] },
];

const allLessons: Lesson[] = stations.flatMap((station) => station.lessons);

/** 所有課程依上課順序排列，用來判斷解鎖。 */
export const orderedLessonIds: string[] = allLessons.map((lesson) => lesson.id);

export function findLesson(id: string): Lesson | undefined {
  return allLessons.find((lesson) => lesson.id === id);
}
