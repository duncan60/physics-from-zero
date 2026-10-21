import { useId } from 'react';
import type { MouseEvent } from 'react';
import { orderedLessonIds, reviewLessonId, reviewOf, reviewStationOf, stations } from '../content/stations';
import { isLessonUnlocked } from '../lib/progress';
import type { Progress } from '../lib/progress';
import type { Lesson, Station } from '../lib/types';
import { routeToHash } from '../lib/router';
import type { Route } from '../lib/router';

// 完美（完成，而且拿過完美：金色、星星）；已完成；可以上（目前這一課是 current，其他還沒上、但已解鎖的是 available）；鎖住。
// 每站的「本站重點與複習」用同一套狀態，只是可以做的時候一律是 available（見 nodeStates）。
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
  // 每站的複習（review-站號）也是一課，但不在上課順序裡：照複習的規則。
  const reviewStation = reviewStationOf(lessonId);
  if (reviewStation !== undefined) return canOpenReview(progress, reviewStation);
  return progress.completed.includes(lessonId) || isLessonUnlocked(orderedLessonIds, progress.completed, lessonId);
}

/**
 * 這一站的「本站重點與複習」（總結頁 #/review/站號 和複習 #/lesson/review-站號）能不能打開：
 * 這一站的每一課都完成了；或是已經做過這一站的複習（和上過的課一樣：以後這一站多了新課，做過的複習也還能再做）。
 * 這一站沒有複習、沒有課，或根本沒有這一站，都打不開。和 canOpenLesson 一樣，地圖和網址都用這一個判斷。
 * 只看這一站自己：做不做複習，都不影響下一站的解鎖（下一站第一課只看這一站最後一課，見 isLessonUnlocked）。
 */
export function canOpenReview(progress: Progress, stationId: number): boolean {
  const station = stations.find((s) => s.id === stationId);
  if (station === undefined || station.lessons.length === 0 || reviewOf(stationId) === undefined) return false;
  if (progress.completed.includes(reviewLessonId(stationId))) return true;
  return station.lessons.every((lesson) => progress.completed.includes(lesson.id));
}

/** 這一站路線上的節點：每一課，有複習的話最後再加「本站重點與複習」。 */
type PathNodeData = { kind: 'lesson'; id: string; lesson: Lesson } | { kind: 'review'; id: string; stationId: number };

function pathNodes(station: Station): PathNodeData[] {
  const nodes: PathNodeData[] = station.lessons.map((lesson) => ({ kind: 'lesson', id: lesson.id, lesson }));
  if (station.lessons.length > 0 && reviewOf(station.id) !== undefined) {
    nodes.push({ kind: 'review', id: reviewLessonId(station.id), stationId: station.id });
  }
  return nodes;
}

/** 已完成的節點：拿過完美就是 perfect。完美清單只增不減；只有真的完成了的才算（存檔被改過、清單裡有沒完成的，也不會因此變金色）。 */
function doneState(progress: Progress, id: string): LessonState {
  return progress.perfect.includes(id) ? 'perfect' : 'completed';
}

/** 地圖上每個節點的狀態，key 是課程 id（複習是 review-站號）。 */
function nodeStates(progress: Progress): Map<string, LessonState> {
  const states = new Map<string, LessonState>();
  let currentFound = false;
  for (const id of orderedLessonIds) {
    if (progress.completed.includes(id)) {
      states.set(id, doneState(progress, id));
    } else if (canOpenLesson(progress, id)) {
      // 依上課順序，第一個還沒上完、可以上的課，就是目前這一課。
      states.set(id, currentFound ? 'available' : 'current');
      currentFound = true;
    } else {
      states.set(id, 'locked');
    }
  }
  // 複習是選擇性的，不在上課順序裡：可以做時是 available，不搶走下一站第一課「目前這一課」的位置。
  for (const station of stations) {
    for (const node of pathNodes(station)) {
      if (node.kind !== 'review') continue;
      if (progress.completed.includes(node.id)) states.set(node.id, doneState(progress, node.id));
      else states.set(node.id, canOpenReview(progress, node.stationId) ? 'available' : 'locked');
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

function NodeLabel(props: { node: PathNodeData }): React.JSX.Element {
  const { node } = props;
  if (node.kind === 'lesson') {
    // 中間的空白讓螢幕閱讀器念成「1-1 慣性 可以上」
    return (
      <span className="path-node-label">
        <span className="path-node-id">{node.lesson.id}</span> <span className="path-node-title">{node.lesson.title}</span>
      </span>
    );
  }
  // 畫面上看得出是哪一站（就在那一站的路線上）；螢幕閱讀器列出所有連結時，靠「第 N 站」分辨每一站的複習。
  return (
    <span className="path-node-label">
      <span className="lp-sr-only">{`第 ${node.stationId} 站`}</span> <span className="path-node-title">本站重點與複習</span>
    </span>
  );
}

function PathNode(props: { node: PathNodeData; state: LessonState; onOpen: (route: Route) => void }): React.JSX.Element {
  const { node, state, onOpen } = props;
  const content = (
    <>
      <span className="path-node-circle">
        <StateIcon state={state} />
      </span>
      <NodeLabel node={node} />{' '}
      <span className="path-node-status">{STATUS_TEXT[state]}</span>
    </>
  );

  if (state === 'locked') {
    return <div className={`path-node path-node--${state}`}>{content}</div>;
  }

  // 課程打開那一課；本站重點與複習打開總結頁（從總結頁再按「開始複習」）。
  const route: Route = node.kind === 'lesson' ? { name: 'lesson', id: node.id } : { name: 'review', stationId: node.stationId };
  // 用真的連結（有 href），長按、在新分頁開啟都能用；一般點擊交給 onOpen。
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(route);
  };
  return (
    <a className={`path-node path-node--${state}`} href={routeToHash(route)} onClick={open} aria-current={state === 'current' ? 'step' : undefined}>
      {content}
    </a>
  );
}

/** 上完了（不論有沒有拿到完美）：這一課之後的路線畫成走過的樣子。 */
function isDone(state: LessonState | undefined): boolean {
  return state === 'completed' || state === 'perfect';
}

function StationPath(props: { station: Station; states: Map<string, LessonState>; onOpen: (route: Route) => void }): React.JSX.Element {
  const { station, states, onOpen } = props;
  const nodes = pathNodes(station);
  const height = nodes.length * ROW_HEIGHT;
  return (
    <div className="path" style={{ width: PATH_WIDTH, height }}>
      <svg className="path-line" width={PATH_WIDTH} height={height} viewBox={`0 0 ${PATH_WIDTH} ${height}`} aria-hidden="true" focusable="false">
        {nodes.slice(0, -1).map((node, i) => (
          <path key={node.id} d={segmentPath(i)} className={isDone(states.get(node.id)) ? 'path-segment path-segment--done' : 'path-segment'} />
        ))}
      </svg>
      <ol className="path-list">
        {nodes.map((node, i) => {
          // 用一邊的 padding 把置中的圓圈往左右推（不用 transform，transform 會把整列推出畫面、出現水平捲軸）。
          const offset = offsetOf(i);
          const style = { height: ROW_HEIGHT, paddingLeft: Math.max(0, 2 * offset), paddingRight: Math.max(0, -2 * offset) };
          return (
            <li key={node.id} className="path-step" style={style}>
              <PathNode node={node} state={states.get(node.id) ?? 'locked'} onOpen={onOpen} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StationSection(props: { station: Station; states: Map<string, LessonState>; onOpen: (route: Route) => void }): React.JSX.Element {
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

/**
 * 路線地圖：7 站依序排下來；有課程的站畫出蜿蜒的路線（有複習的站，最後一個節點是「本站重點與複習」），
 * 還沒有課程的站顯示「即將推出」。點了節點呼叫 onOpen，帶著要去的頁面（那一課，或那一站的總結頁）。
 */
export function PathMap(props: { progress: Progress; onOpen: (route: Route) => void }): React.JSX.Element {
  const { progress, onOpen } = props;
  const states = nodeStates(progress);
  return (
    <div className="map">
      {stations.map((station) => (
        <StationSection key={station.id} station={station} states={states} onOpen={onOpen} />
      ))}
    </div>
  );
}
