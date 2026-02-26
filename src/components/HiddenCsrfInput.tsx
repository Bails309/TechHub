
'use client';

import { useEffect, useRef, useState } from 'react';

function generateToken() {
  const crypto = (globalThis as any)?.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getCsrfTokenFromCookie() {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith('XSRF-TOKEN=')) {
      return decodeURIComponent(part.slice('XSRF-TOKEN='.length));
    }
  }
  const next = generateToken();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const cookieParts = [
    `XSRF-TOKEN=${encodeURIComponent(next)}`,
    'path=/',
    'samesite=lax'
  ];
  if (secure) cookieParts.push('secure');
  document.cookie = cookieParts.join('; ');
  return next;
}

export default function HiddenCsrfInput() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [token, setToken] = useState(() => getCsrfTokenFromCookie());

  useEffect(() => {
    const update = () => {
      const next = getCsrfTokenFromCookie();
      setToken(next);
      if (inputRef.current) inputRef.current.value = next;
    };

    update();
    const form = inputRef.current?.closest('form');
    if (form) form.addEventListener('submit', update);
    document.addEventListener('visibilitychange', update);

    return () => {
      if (form) form.removeEventListener('submit', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <input ref={inputRef} type="hidden" name="csrfToken" value={token} />;
}
