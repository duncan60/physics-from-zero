import { useEffect, useState } from 'react';
import type { GuideStep } from '../lib/types';
import { QuestionCard } from './QuestionCard';
import { ConceptView } from './steps/ConceptView';

/** 換步驟時把焦點移到新的步驟上，鍵盤和螢幕閱讀器使用者不會停在已經消失的按鈕上。 */
function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

/**
 * 依序跑完引導步驟，最後呼叫 `onDone()`。
 * 引導裡的題目不會再有引導（內容測試保證），這裡也不傳 `onRequestGuide`，答錯只會有「再試一次」和「看解答」。
 */
export function GuideRunner(props: { steps: GuideStep[]; onDone: () => void }): React.JSX.Element {
  const { steps, onDone } = props;
  const [index, setIndex] = useState(0);
  const step = steps[index] as GuideStep | undefined;

  // 沒有任何引導步驟時，直接結束。
  useEffect(() => {
    if (steps.length === 0) onDone();
  }, [steps.length, onDone]);

  function next(): void {
    if (index + 1 >= steps.length) onDone();
    else setIndex(index + 1);
  }

  return (
    <section className="lp-guide" aria-label="一步一步來">
      {step !== undefined && (
        <div key={index} ref={focusOnMount} tabIndex={-1} className="lp-guide-step">
          {step.kind === 'concept' ? <ConceptView step={step} onContinue={next} /> : <QuestionCard step={step} onFinish={next} />}
        </div>
      )}
    </section>
  );
}
