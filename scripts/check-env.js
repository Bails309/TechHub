// Validate critical environment variables at startup to prevent insecure defaults
const { env } = process;

function parseDatabaseUrl(url) {
  try {
    // support postgres://user:pass@host:port/db
    const m = url.match(/^(?:postgres(?:ql)?:)?\/\/(.*?):(.*?)@/);
    if (!m) return null;
    return { user: m[1], password: m[2] };
  } catch (e) {
    return null;
  }
}

if (env.NODE_ENV === 'production') {
  // Prefer explicit POSTGRES_PASSWORD, but also accept DATABASE_URL
  const pgPassword = env.POSTGRES_PASSWORD || (() => {
    if (env.DATABASE_URL) {
      const parsed = parseDatabaseUrl(env.DATABASE_URL);
      return parsed ? parsed.password : undefined;
    }
    return undefined;
  })();

  const pgUser = env.POSTGRES_USER || (() => {
    if (env.DATABASE_URL) {
      const parsed = parseDatabaseUrl(env.DATABASE_URL);
      return parsed ? parsed.user : undefined;
    }
    return undefined;
  })();

  const insecureUser = pgUser === 'techhub' || !pgUser;
  const insecurePass = !pgPassword || pgPassword === 'techhub' || pgPassword.length < 12;

  if (insecureUser || insecurePass) {
    // Fail fast in production to avoid insecure DB defaults
    console.error('FATAL: insecure database credentials detected for production.');
    console.error('Set strong POSTGRES_USER and POSTGRES_PASSWORD and do not use the default "techhub" values.');
    process.exit(1);
  }
}

// Additionally warn in non-production if using defaults
if (env.NODE_ENV !== 'production') {
  const pgPassword = env.POSTGRES_PASSWORD || (env.DATABASE_URL && parseDatabaseUrl(env.DATABASE_URL)?.password);
  if (pgPassword === 'techhub') {
    console.warn('Warning: using default DB password "techhub" in non-production environment.');
  }
}
