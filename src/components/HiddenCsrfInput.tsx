
'use client';

import { useCsrfToken } from './CsrfProvider';

export default function HiddenCsrfInput() {
  const token = useCsrfToken();
  return <input type="hidden" name="csrfToken" value={token} />;
}
