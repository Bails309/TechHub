import IORedis, { RedisOptions, Cluster } from 'ioredis';

type RedisClient = IORedis | Cluster;

let sharedRedisClient: RedisClient | null = null;
let sharedRedisPromise: Promise<RedisClient | null> | null = null;
let lastFailureTime = 0;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function getSharedRedisClient(): Promise<RedisClient | null> {
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

            const isTls = url.startsWith('rediss:') || process.env.REDIS_TLS === 'true';
            if (isTls) {
                // For Azure, it's critical to provide the servername for SNI and for discovered nodes to use TLS.
                try {
                    const hostname = new URL(url).hostname;
                    opts.tls = { servername: hostname };
                } catch {
                    opts.tls = {} as RedisOptions['tls'];
                }
            }

            let client: RedisClient;
            if (process.env.REDIS_CLUSTER === 'true') {
                // For Clustered Redis (Azure OSSCluster), we must provide the bootstrap node clearly.
                try {
                    const parsed = new URL(url);
                    const clusterNode = {
                        host: parsed.hostname,
                        port: parseInt(parsed.port || '6379'),
                        password: parsed.password || process.env.REDIS_PASSWORD || undefined,
                        tls: isTls ? opts.tls : undefined
                    };
                    client = new IORedis.Cluster([clusterNode], {
                        redisOptions: opts,
                        slotsRefreshTimeout: 5000,
                        dnsLookup: (address, callback) => callback(null, address, 4), // Prefer IPv4 for Azure compatibility
                        clusterRetryStrategy: (times) => Math.min(times * 100, 2000)
                    });
                } catch (e) {
                    console.error('[REDIS] Failed to parse REDIS_URL for Cluster mode, falling back to raw URL string');
                    client = new IORedis.Cluster([url], {
                        redisOptions: opts,
                        slotsRefreshTimeout: 5000
                    });
                }
            } else {
                client = url ? new IORedis(url, opts) : new IORedis(opts);
            }
            client.on('error', (err) => {
                if (process.env.NODE_ENV !== 'test') {
                    console.error('[REDIS] Client error:', err.message);
                }
            });

            // diagnostic
            console.log('[REDIS] Attempting connection to %s (Cluster: %s)',
                url ? url.split('@').pop() : 'default',
                process.env.REDIS_CLUSTER === 'true' ? 'enabled' : 'disabled'
            );

            // Race the ping against a timeout so we don't hang the whole app if Redis is unreachable
            const pingPromise = client.ping();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 5000));

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
export function _setSharedRedisClientForTest(client: RedisClient | null) {
    if (sharedRedisClient && client !== sharedRedisClient) {
        try {
            sharedRedisClient.disconnect();
        } catch { /* ignore */ }
    }
    sharedRedisClient = client;
}
