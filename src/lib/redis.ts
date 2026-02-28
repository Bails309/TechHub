import IORedis, { RedisOptions } from 'ioredis';

let sharedRedisClient: IORedis | null = null;
let sharedRedisPromise: Promise<IORedis | null> | null = null;
let lastFailureTime = 0;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function getSharedRedisClient(): Promise<IORedis | null> {
    if (sharedRedisClient) return sharedRedisClient;
    if (sharedRedisPromise) return sharedRedisPromise;

    // Circuit breaker: If we failed recently, don't even try for a while
    const now = Date.now();
    if (now - lastFailureTime < FAILURE_COOLDOWN_MS) {
        return null;
    }

    const url = process.env.REDIS_URL ?? '';
    if (!url && process.env.NODE_ENV === 'production') {
        console.warn('[REDIS] REDIS_URL is not set. Resuming with direct database queries only.');
        return null;
    }

    sharedRedisPromise = (async () => {
        try {
            const opts: RedisOptions = {};
            if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;
            if (process.env.REDIS_TLS === 'true') opts.tls = {} as RedisOptions['tls'];

            const client = url ? new IORedis(url, opts) : new IORedis(opts);
            client.on('error', () => { /* Prevent unhandled promise rejections on network disconnect */ });

            // diagnostic
            console.log('[REDIS] Attempting connection to %s', url ? url.split('@').pop() : 'default');

            // Race the ping against a timeout so we don't hang the whole app if Redis is unreachable
            const pingPromise = client.ping();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 2000));

            await Promise.race([pingPromise, timeoutPromise]);

            sharedRedisClient = client;
            console.log('[REDIS] Connection SUCCESSFUL');
            return client;
        } catch (e) {
            lastFailureTime = Date.now();
            console.error('[REDIS] Connection FAILED: %s (Circuit breaker active for 5m)', e instanceof Error ? e.message : String(e));
            try {
                if (sharedRedisClient) await sharedRedisClient.disconnect();
            } catch { /* ignore */ }
            sharedRedisClient = null;
            if (process.env.NODE_ENV === 'production') {
                console.error('[REDIS] Resuming without Redis (fallback to DB) due to connection failure');
            }
            return null;
        } finally {
            sharedRedisPromise = null;
        }
    })();

    return sharedRedisPromise;
}

// For testing purposes
export function _setSharedRedisClientForTest(client: IORedis | null) {
    if (sharedRedisClient && client !== sharedRedisClient) {
        try {
            sharedRedisClient.disconnect();
        } catch { /* ignore */ }
    }
    sharedRedisClient = client;
}
