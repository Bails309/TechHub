import IORedis, { RedisOptions } from 'ioredis';

let sharedRedisClient: IORedis | null = null;
let sharedRedisPromise: Promise<IORedis | null> | null = null;

export async function getSharedRedisClient(): Promise<IORedis | null> {
    if (sharedRedisClient) return sharedRedisClient;
    if (sharedRedisPromise) return sharedRedisPromise;

    const url = process.env.REDIS_URL ?? '';
    if (!url && process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_URL must be set when using Redis in production');
    }

    sharedRedisPromise = (async () => {
        try {
            const opts: RedisOptions = {};
            if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;
            if (process.env.REDIS_TLS === 'true') opts.tls = {} as RedisOptions['tls'];

            const client = url ? new IORedis(url, opts) : new IORedis(opts);
            client.on('error', () => { /* Prevent unhandled promise rejections on network disconnect */ });

            await client.ping();
            sharedRedisClient = client;
            return client;
        } catch (e) {
            try {
                if (sharedRedisClient) await sharedRedisClient.disconnect();
            } catch { /* ignore */ }
            sharedRedisClient = null;
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Failed to connect to Redis: ' + (e instanceof Error ? e.message : String(e)));
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
