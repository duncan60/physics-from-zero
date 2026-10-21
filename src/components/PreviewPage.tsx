import { useId } from 'react';
import { reviewAsLesson, reviewOf, stations } from '../content/stations';
import type { Lesson, Station, Step } from '../lib/types';

// 本機預覽（#/preview）：只在開發模式有。App.tsx 用 `import.meta.env.DEV` 擋住所有用到這個檔案的地方，
// 正式建置時整個檔案連同裡面的字都會被 Vite 移除。確認方法：npm run build 之後，
// `grep -l '預覽模式' dist/assets/*.js` 和 `grep -l '從這裡開始' dist/assets/*.js` 都找不到東西。

// 新增一種步驟時，這裡少了就會編譯失敗。
const KIND_LABELS: Record<Step['kind'], string> = {
  concept: '觀念卡',
  choice: '選擇題',
  number: '數字題',
  table: '表格題',
  formula: '拼算式',
  slider: '滑桿題',
  sim: '動畫',
  match: '配對',
};

/** 預覽中的提示列，放在上課畫面上方：這裡做的一切都不會留下紀錄。 */
export function PreviewBanner(): React.JSX.Element {
  return <p className="preview-banner">預覽模式：不會存進度</p>;
}

/** 一課（或一站的複習）的每一步：編號（從 1 算起）、步驟 id、題型，和「從這裡開始」。 */
function LessonSteps(props: { lesson: Lesson; onStart: (lessonId: string, step: number) => void }): React.JSX.Element {
  const { lesson, onStart } = props;
  const titleId = useId();
  return (
    <section className="preview-lesson" aria-labelledby={titleId}>
      <h4 id={titleId} className="preview-lesson-title">{`${lesson.id} ${lesson.title}`}</h4>
      <ol className="preview-steps">
        {lesson.steps.map((step, index) => (
          <li key={step.id} className="preview-step">
            <span className="preview-step-no">{index + 1}</span>
            <span className="preview-step-info">
              <code className="preview-step-id">{step.id}</code>
              <span className="preview-step-kind">{`${KIND_LABELS[step.kind]}（${step.kind}）`}</span>
            </span>
            {/* 看得到的字是「從這裡開始」；名稱再補上是哪一課的第幾步，用螢幕閱讀器的按鈕清單也分得出來。 */}
            <button
              type="button"
              className="lp-button preview-step-start"
              aria-label={`從這裡開始：${lesson.id} 第 ${index + 1} 步`}
              onClick={() => onStart(lesson.id, index + 1)}
            >
              從這裡開始
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StationSteps(props: { station: Station; onStart: (lessonId: string, step: number) => void }): React.JSX.Element {
  const { station, onStart } = props;
  const titleId = useId();
  const review = reviewOf(station.id);
  return (
    <section className="preview-station" aria-labelledby={titleId}>
      <h3 id={titleId} className="preview-station-title">{`第 ${station.id} 站：${station.title}`}</h3>
      {station.lessons.length === 0 && <p className="preview-empty">還沒有課</p>}
      {station.lessons.map((lesson) => (
        <LessonSteps key={lesson.id} lesson={lesson} onStart={onStart} />
      ))}
      {/* 這一站的複習（review-站號）和課程一樣，每一步都能開始 */}
      {review !== undefined && <LessonSteps lesson={reviewAsLesson(review)} onStart={onStart} />}
    </section>
  );
}

/**
 * 本機預覽頁：列出每一站、每一課、每一步（編號、id、題型）和每一站的複習，每一步一個「從這裡開始」。
 * `onStart(課程 id, 步驟編號)`：步驟編號從 1 算起，和這裡顯示的一樣。
 */
export function PreviewPage(props: { onStart: (lessonId: string, step: number) => void; onBack: () => void }): React.JSX.Element {
  const { onStart, onBack } = props;
  const titleId = useId();
  return (
    <section className="preview" aria-labelledby={titleId}>
      <div className="preview-head">
        <h2 id={titleId} className="preview-title">
          本機預覽
        </h2>
        <button type="button" className="lp-button preview-back" onClick={onBack}>
          回到地圖
        </button>
      </div>
      <p className="preview-lead">
        只有開發模式看得到這一頁。按任何一步的「從這裡開始」，就從那一步上課：不受解鎖限制，不存進度，也不加 XP。
      </p>
      {stations.map((station) => (
        <StationSteps key={station.id} station={station} onStart={onStart} />
      ))}
    </section>
  );
}
