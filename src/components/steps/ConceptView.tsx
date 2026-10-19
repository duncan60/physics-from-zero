import type { ConceptStep } from '../../lib/types';
import { useActionGuard } from '../useActionGuard';

export function ConceptView(props: { step: ConceptStep; onContinue: () => void }): React.JSX.Element {
  const { step, onContinue } = props;
  const guard = useActionGuard();
  return (
    <section className="lp-concept">
      {step.title !== undefined && <h2 className="lp-concept-title">{step.title}</h2>}
      {step.body.map((text, i) => (
        <p key={i} className="lp-concept-text">
          {text}
        </p>
      ))}
      <div className="lp-actions">
        <button type="button" className="lp-button lp-button--primary" onClick={guard(onContinue)}>
          繼續
        </button>
      </div>
    </section>
  );
}
