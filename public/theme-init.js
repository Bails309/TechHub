(() => {
  try {
    const stored = window.localStorage.getItem('techhub-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = stored === 'light' || stored === 'dark' ? stored : prefersLight ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    // ignore
  }
})();
