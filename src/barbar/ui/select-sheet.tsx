import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet } from './sheet';

type Choice = { value: string; label: string; disabled: boolean };
type Group = { label?: string; options: Choice[] };

const choice = (option: HTMLOptionElement): Choice => ({
  value: option.value,
  label: option.textContent?.trim() || option.value,
  disabled: option.disabled,
});

function groups(select: HTMLSelectElement): Group[] {
  const result: Group[] = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement)
      result.push({
        label: child.label,
        options: Array.from(child.children as HTMLCollectionOf<HTMLOptionElement>).map(choice),
      });
    else if (child instanceof HTMLOptionElement) {
      const last = result[result.length - 1];
      if (last && !last.label) last.options.push(choice(child));
      else result.push({ options: [choice(child)] });
    }
  }
  return result;
}

const title = (select: HTMLSelectElement) =>
  select.getAttribute('aria-label') ||
  select.labels?.[0]?.textContent?.trim() ||
  select.closest('label')?.textContent?.trim() ||
  '';

/** Sets the value the way a user choice does, so React `onChange` handlers run. */
function choose(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Phones: every native dropdown opens as a readable bottom sheet instead of the browser popup,
 * whose font size CSS cannot control. Keyboard and programmatic selection stay native.
 */
export function SelectSheet() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  useEffect(() => {
    const target = (event: Event) => {
      const element = event.target instanceof Element ? event.target.closest('select') : null;
      return element && !element.disabled && !element.multiple ? element : null;
    };
    const suppress = (event: Event) => {
      if (target(event)) event.preventDefault();
    };
    const open = (event: Event) => {
      const element = target(event);
      if (!element) return;
      event.preventDefault();
      setSelect(element);
    };
    const options = { capture: true, passive: false } as const;
    document.addEventListener('pointerdown', suppress, options);
    document.addEventListener('mousedown', suppress, options);
    // Touch browsers open their picker on tap; ending the touch here also cancels the synthetic click.
    document.addEventListener('touchend', open, options);
    document.addEventListener('click', open, options);
    return () => {
      document.removeEventListener('pointerdown', suppress, options);
      document.removeEventListener('mousedown', suppress, options);
      document.removeEventListener('touchend', open, options);
      document.removeEventListener('click', open, options);
    };
  }, []);
  if (!select) return null;
  const close = () => setSelect(null);
  return (
    <Sheet title={title(select)} close={close}>
      <div className="select-sheet">
        {groups(select).map((group, index) => (
          <div key={`${group.label || ''}:${index}`} role="group" aria-label={group.label}>
            {group.label && <h3>{group.label}</h3>}
            {group.options.map((option) => {
              const selected = option.value === select.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'selected' : ''}
                  aria-pressed={selected}
                  disabled={option.disabled}
                  onClick={() => {
                    close();
                    if (!selected) choose(select, option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {selected && <Check size={18} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
