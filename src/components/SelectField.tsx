'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  className?: string;
}

export default function SelectField({
  name,
  options,
  defaultValue,
  className
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (defaultValue !== undefined) {
      setValue(defaultValue);
    }
  }, [defaultValue]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`.trim()}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="input-surface flex w-full items-center justify-between rounded-full px-5 py-3 text-ink-100 shadow-glow/30 focus:outline-none focus:ring-2 focus:ring-ocean-400/60"
      >
        <span className="truncate">{selected?.label ?? 'Select'}</span>
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="select-panel absolute z-20 mt-2 w-full rounded-2xl p-2 shadow-glow/40">
          <ul className="max-h-56 overflow-y-auto">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(option.value);
                    setOpen(false);
                  }}
                  className={`select-option flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition ${
                    option.value === value ? 'is-selected' : ''
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
