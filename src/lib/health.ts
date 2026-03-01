import { prisma } from './prisma';
import { getSharedRedisClient } from './redis';
import { getStorageConfigMap } from './storageConfig';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface HealthStatus {
    status: 'ok' | 'error' | 'warning';
    latency?: number;
    message?: string;
    details?: Record<string, any>;
}

export async function checkDatabaseHealth(): Promise<HealthStatus> {
    const start = Date.now();
    try {
        // Basic connectivity check
        await prisma.$queryRaw`SELECT 1`;
        return {
            status: 'ok',
            latency: Date.now() - start
        };
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof Error ? e.message : String(e)
        };
    }
}

export async function checkRedisHealth(): Promise<HealthStatus> {
    const start = Date.now();
    try {
        const client = await getSharedRedisClient();
        if (!client) {
            // Check if it's explicitly disabled or just failing
            if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'production') {
                return {
                    status: 'warning',
                    message: 'Redis URL not configured (Using in-memory fallback)'
                };
            }
            return {
                status: 'error',
                message: 'Redis connection failed or circuit breaker is ACTIVE'
            };
        }
        await client.ping();
        const info = await client.info('memory');

        // Simple parser for Redis INFO output
        const getMetric = (key: string) => {
            // Azure/Managed Redis might have slightly different spacing or line endings
            const regex = new RegExp(`^${key}:\\s*(\\d+)`, 'mi');
            const match = info.match(regex);
            return match ? parseInt(match[1], 10) : 0;
        };

        const usedMemory = getMetric('used_memory');
        let maxMemory = getMetric('maxmemory');

        // Fallback: If maxmemory is 0 (unlimited), check total_system_memory 
        // which often reflects the actual infrastructure/container cap.
        if (maxMemory === 0) {
            maxMemory = getMetric('total_system_memory');
        }

        return {
            status: 'ok',
            latency: Date.now() - start,
            details: {
                usedMemory,
                maxMemory,
                percentage: maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0
            }
        };
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof Error ? e.message : String(e)
        };
    }
}

export async function checkStorageHealth(): Promise<HealthStatus> {
    try {
        const configs = await getStorageConfigMap();
        const active = Array.from(configs.values()).find(c => c.enabled);

        if (!active) {
            return {
                status: 'warning',
                message: 'No storage provider is enabled'
            };
        }

        // Map technical provider IDs to user-friendly labels
        const providerLabels: Record<string, string> = {
            'local': 'Local Filesystem',
            's3': 'Amazon S3',
            'azure': 'Azure Blob Storage'
        };

        const provider = active.provider;
        let details: Record<string, any> = {
            provider: providerLabels[provider] || provider
        };

        if (provider === 'local') {
            details.path = active.config?.path ?? 'public/uploads (default)';
        } else if (provider === 's3') {
            details.bucket = active.config?.bucket;
            details.region = active.config?.region;
        } else if (provider === 'azure') {
            details.container = active.config?.containerName;
            details.account = active.config?.accountName;
        }

        return {
            status: 'ok',
            message: `Active provider: ${providerLabels[provider] || provider}`,
            details
        };
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof Error ? e.message : String(e)
        };
    }
}

export async function checkSchemaHealth(): Promise<HealthStatus> {
    const start = Date.now();
    try {
        const schemaState = await prisma.systemState.findUnique({
            where: { id: 'SCHEMA_HASH' }
        });

        const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
        let currentHash = 'unknown';
        if (fs.existsSync(schemaPath)) {
            const schemaContent = fs.readFileSync(schemaPath, 'utf8');
            const normalizedContent = schemaContent.replace(/\r\n/g, '\n');
            currentHash = crypto.createHash('sha256').update(normalizedContent).digest('hex');
        }

        const dbHash = schemaState?.value;
        const isMatch = currentHash === dbHash;

        return {
            status: isMatch ? 'ok' : 'warning',
            latency: Date.now() - start,
            message: isMatch ? 'Schema is in sync' : (dbHash ? 'Schema out of sync' : 'Never synchronized'),
            details: {
                currentHash: currentHash.substring(0, 8),
                databaseHash: dbHash ? dbHash.substring(0, 8) : 'None',
                lastSync: schemaState?.updatedAt || 'Unknown'
            }
        };
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof Error ? e.message : String(e)
        };
    }
}

export async function getSystemHealth() {
    const [db, redis, storage, schema] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        checkStorageHealth(),
        checkSchemaHealth()
    ]);

    return {
        db,
        redis,
        storage,
        schema,
        timestamp: new Date().toISOString(),
        server: {
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            nodeEnv: process.env.NODE_ENV
        }
    };
}
