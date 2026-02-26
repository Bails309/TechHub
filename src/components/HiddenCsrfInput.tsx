
'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Read the XSRF-TOKEN cookie value set by the server middleware.
 * Returns '' if no cookie is found (e.g. before the first navigation).
 *
 * IMPORTANT: This function is READ-ONLY. The client must never generate
 * CSRF tokens — the server creates HMAC-signed tokens in middleware.
 */
export function getCsrfTokenFromCookie(): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';').map((p) => p.trim());
  let fallback = '';
  for (const part of parts) {
    if (part.startsWith('XSRF-TOKEN=')) {
      const val = decodeURIComponent(part.slice('XSRF-TOKEN='.length));
      // Stop searching if we find a valid HMAC token (has a dot)
      if (val.includes('.')) return val;
      fallback = val;
    }
  }
  return fallback;
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
