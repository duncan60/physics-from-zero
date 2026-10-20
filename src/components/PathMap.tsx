import { useId } from 'react';
import type { MouseEvent } from 'react';
import { orderedLessonIds, stations } from '../content/stations';
import { isLessonUnlocked } from '../lib/progress';
import type { Progress } from '../lib/progress';
import type { Lesson, Station } from '../lib/types';
import { routeToHash } from '../lib/router';

// 完美（完成，而且拿過完美：金色、星星）；已完成；可以上（目前這一課是 current，其他還沒上、但已解鎖的是 available）；鎖住。
type LessonState = 'perfect' | 'completed' | 'current' | 'available' | 'locked';

const STATUS_TEXT: Record<LessonState, string> = {
  perfect: '完美',
  completed: '已完成',
  current: '可以上',
  available: '可以上',
  locked: '鎖住',
};

/**
 * 這一課能不能打開：依解鎖規則已解鎖，或是已經上過（課程順序以後改了，上過的課也還能複習）。
 * 地圖和課程網址都用這一個判斷，地圖上點得到的課，打開時一定不會顯示「還沒解鎖」。
 */
export function canOpenLesson(progress: Progress, lessonId: string): boolean {
  return progress.completed.includes(lessonId) || isLessonUnlocked(orderedLessonIds, progress.completed, lessonId);
}

function lessonStates(progress: Progress): Map<string, LessonState> {
  const states = new Map<string, LessonState>();
  let currentFound = false;
  for (const id of orderedLessonIds) {
    if (progress.completed.includes(id)) {
      // 完美清單只增不減；只有真的完成了的課才算（存檔被改過、清單裡有沒完成的課，也不會因此變金色）。
      states.set(id, progress.perfect.includes(id) ? 'perfect' : 'completed');
    } else if (canOpenLesson(progress, id)) {
      // 依上課順序，第一個還沒上完、可以上的課，就是目前這一課。
      states.set(id, currentFound ? 'available' : 'current');
      currentFound = true;
    } else {
      states.set(id, 'locked');
    }
  }
  return states;
}

// ---- 蜿蜒的路線：每一課一列，左右錯開，用 SVG 曲線把圓圈連起來 ----
const PATH_WIDTH = 280; // 360px 寬的手機扣掉左右 16px 還放得下
const ROW_HEIGHT = 152;
const NODE_CENTER_Y = 40; // 圓圈中心離這一列頂端的距離（圓圈放在 80px 高的方框正中間）
const OFFSETS = [0, 60, 0, -60]; // 每一列圓圈離中線的水平距離，四列一個循環

function offsetOf(index: number): number {
  return OFFSETS[index % OFFSETS.length];
}

function nodeCenter(index: number): { x: number; y: number } {
  return { x: PATH_WIDTH / 2 + offsetOf(index), y: index * ROW_HEIGHT + NODE_CENTER_Y };
}

function segmentPath(from: number): string {
  const a = nodeCenter(from);
  const b = nodeCenter(from + 1);
  const bend = ROW_HEIGHT / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + bend}, ${b.x} ${b.y - bend}, ${b.x} ${b.y}`;
}

// ---- 圖示（裝飾用，aria-hidden；狀態一定也有文字） ----
function CheckIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
      <path
        d="M12 3.5l2.35 5.76 6.21.46-4.76 4.02 1.49 6.04L12 16.5l-5.29 3.28 1.49-6.04-4.76-4.02 6.21-.46z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path d="M8.5 5.5v13l10-6.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon(props: { size?: number }): React.JSX.Element {
  const size = props.size ?? 26;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function StateIcon(props: { state: LessonState }): React.JSX.Element {
  switch (props.state) {
    case 'perfect':
      return <StarIcon />;
    case 'completed':
      return <CheckIcon />;
    case 'current':
    case 'available':
      return <PlayIcon />;
    case 'locked':
      return <LockIcon />;
  }
}

function LessonNode(props: { lesson: Lesson; state: LessonState; onOpen: (lessonId: string) => void }): React.JSX.Element {
  const { lesson, state, onOpen } = props;
  const content = (
    <>
      <span className="path-node-circle">
        <StateIcon state={state} />
      </span>
      {/* 中間的空白讓螢幕閱讀器念成「1-1 慣性 可以上」 */}
      <span className="path-node-label">
        <span className="path-node-id">{lesson.id}</span> <span className="path-node-title">{lesson.title}</span>
      </span>{' '}
      <span className="path-node-status">{STATUS_TEXT[state]}</span>
    </>
  );

  if (state === 'locked') {
    return <div className={`path-node path-node--${state}`}>{content}</div>;
  }

  // 用真的連結（有 href），長按、在新分頁開啟都能用；一般點擊交給 onOpen。
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(lesson.id);
  };
  return (
    <a
      className={`path-node path-node--${state}`}
      href={routeToHash({ name: 'lesson', id: lesson.id })}
      onClick={open}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {content}
    </a>
  );
}

/** 上完了（不論有沒有拿到完美）：這一課之後的路線畫成走過的樣子。 */
function isDone(state: LessonState | undefined): boolean {
  return state === 'completed' || state === 'perfect';
}

function StationPath(props: { station: Station; states: Map<string, LessonState>; onOpen: (lessonId: string) => void }): React.JSX.Element {
  const { station, states, onOpen } = props;
  const height = station.lessons.length * ROW_HEIGHT;
  return (
    <div className="path" style={{ width: PATH_WIDTH, height }}>
      <svg className="path-line" width={PATH_WIDTH} height={height} viewBox={`0 0 ${PATH_WIDTH} ${height}`} aria-hidden="true" focusable="false">
        {station.lessons.slice(0, -1).map((lesson, i) => (
          <path
            key={lesson.id}
            d={segmentPath(i)}
            className={isDone(states.get(lesson.id)) ? 'path-segment path-segment--done' : 'path-segment'}
          />
        ))}
      </svg>
      <ol className="path-list">
        {station.lessons.map((lesson, i) => {
          // 用一邊的 padding 把置中的圓圈往左右推（不用 transform，transform 會把整列推出畫面、出現水平捲軸）。
          const offset = offsetOf(i);
          const style = { height: ROW_HEIGHT, paddingLeft: Math.max(0, 2 * offset), paddingRight: Math.max(0, -2 * offset) };
          return (
            <li key={lesson.id} className="path-step" style={style}>
              <LessonNode lesson={lesson} state={states.get(lesson.id) ?? 'locked'} onOpen={onOpen} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StationSection(props: { station: Station; states: Map<string, LessonState>; onOpen: (lessonId: string) => void }): React.JSX.Element {
  const { station, states, onOpen } = props;
  const titleId = useId();
  const comingSoon = station.lessons.length === 0;
  return (
    <section className={comingSoon ? 'station station--soon' : 'station'} aria-labelledby={titleId}>
      <h2 id={titleId} className="station-title">
        <span className="station-number">{`第 ${station.id} 站`}</span> <span className="station-name">{station.title}</span>
      </h2>
      {comingSoon ? (
        <p className="station-soon">
          <LockIcon size={18} />
          <span>即將推出</span>
        </p>
      ) : (
        <StationPath station={station} states={states} onOpen={onOpen} />
      )}
    </section>
  );
}

/** 路線地圖：7 站依序排下來；有課程的站畫出蜿蜒的路線，還沒有課程的站顯示「即將推出」。 */
export function PathMap(props: { progress: Progress; onOpen: (lessonId: string) => void }): React.JSX.Element {
  const { progress, onOpen } = props;
  const states = lessonStates(progress);
  return (
    <div className="map">
      {stations.map((station) => (
        <StationSection key={station.id} station={station} states={states} onOpen={onOpen} />
      ))}
    </div>
  );
}
