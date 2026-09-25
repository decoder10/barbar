import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../presentation/i18n/runtime';

export interface FormStep {
  title: string;
  content: ReactNode;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const firstInvalid = (panel?: HTMLElement | null) =>
  Array.from(panel?.querySelectorAll<Control>('input, select, textarea') || []).find(
    (control) => !control.checkValidity(),
  );

/**
 * A long dialog form split into steps. Every step stays mounted, so values, uploads and validation survive
 * switching. «Далее» (also Enter) checks only the visible step; saving checks all of them and opens the step
 * of the first invalid field.
 */
export function FormSteps({
  steps,
  submit,
  onSubmit,
}: {
  steps: FormStep[];
  submit: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [current, setCurrent] = useState(0);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const last = current === steps.length - 1;
  const show = (index: number) => {
    flushSync(() => setCurrent(index));
    const panel = panels.current[index];
    panel?.closest('dialog')?.scrollTo({ top: 0 });
    panel?.focus({ preventScroll: true });
  };
  return (
    <form
      noValidate
      onSubmit={(event) => {
        if (!last) {
          event.preventDefault();
          const invalid = firstInvalid(panels.current[current]);
          if (invalid) invalid.reportValidity();
          else show(current + 1);
          return;
        }
        const step = panels.current.findIndex((panel) => firstInvalid(panel));
        if (step >= 0) {
          event.preventDefault();
          if (step !== current) show(step);
          firstInvalid(panels.current[step])?.reportValidity();
          return;
        }
        onSubmit(event);
      }}
    >
      <ol className="form-steps-nav" style={{ '--steps': steps.length } as CSSProperties}>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={index === current ? 'active' : index < current ? 'done' : undefined}
          >
            <button
              type="button"
              aria-current={index === current ? 'step' : undefined}
              onClick={() => index !== current && show(index)}
            >
              <span className="form-step-dot" aria-hidden="true">
                {index < current ? <Check size={15} strokeWidth={3} /> : index + 1}
              </span>
              <span className="form-step-title">{t(step.title)}</span>
              <span className="visually-hidden">{t(`Шаг ${index + 1} из ${steps.length}`)}</span>
            </button>
          </li>
        ))}
      </ol>
      {steps.map((step, index) => (
        <div
          key={step.title}
          ref={(panel) => {
            panels.current[index] = panel;
          }}
          className="form-step"
          role="group"
          aria-label={t(step.title)}
          tabIndex={-1}
          hidden={index !== current}
        >
          {step.content}
        </div>
      ))}
      <div
        className="form-steps-footer"
        // The second click of a double click on «Далее» lands on «Сохранить» in the same place: never save by it.
        onClickCapture={(event) => {
          if (event.detail > 1) event.preventDefault();
        }}
      >
        {current > 0 && (
          <button type="button" className="button secondary" onClick={() => show(current - 1)}>
            <ArrowLeft size={17} /> {t('Назад')}
          </button>
        )}
        {last ? (
          submit
        ) : (
          <button type="submit" className="button primary">
            {t('Далее')} <ArrowRight size={17} />
          </button>
        )}
      </div>
    </form>
  );
}
