import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { t } from '../i18n/runtime';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      {t(
        isValidElement(children)
          ? cloneElement(children as ReactElement<{ id: string; 'aria-describedby'?: string }>, {
              id,
              'aria-describedby': hint ? `${id}-hint` : undefined,
            })
          : children,
      )}
      {t(hint && <small id={`${id}-hint`}>{t(hint)}</small>)}
    </div>
  );
}

export function GlassVolumeField({
  value,
  onChange,
  max,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  max?: number;
  hint?: string;
}) {
  const listId = useId();
  return (
    <>
      <Field label="Объём одного бокала, мл" hint={hint}>
        <input
          type="number"
          min="1"
          max={max}
          step="1"
          required
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      <datalist id={listId}>
        {t(
          [50, 100, 125, 150, 200, 250, 300]
            .filter((n) => n <= (max || 10000))
            .map((n) => <option key={n} value={n} />),
        )}
      </datalist>
    </>
  );
}
