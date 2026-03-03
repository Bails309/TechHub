/**
 * getSessionMaxAgeSeconds returns the absolute session lifetime in seconds.
 * This is split into a separate file to be compatible with the Edge Runtime (middleware).
 */
export function getSessionMaxAgeSeconds(): number {
    const env = process.env.SESSION_MAX_AGE_SECONDS;
    const val = env ? Number(env) : 28800; // 8 hours default
    return val > 0 ? val : 28800;
}

/**
 * getSessionIdleTimeoutMs returns the idle session timeout in milliseconds.
 * This is split into a separate file to be compatible with the Edge Runtime (middleware).
 */
export function getSessionIdleTimeoutMs(): number {
    const env = process.env.SESSION_IDLE_TIMEOUT_MS;
    const val = env ? Number(env) : 1200000; // 20 minutes default
    return val > 0 ? val : 1200000;
}
