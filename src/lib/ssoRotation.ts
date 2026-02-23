import { prisma } from './prisma';
import { decryptSecret, encryptSecretWithKeyId, getCurrentKeyId, getSecretKeyId } from './crypto';

type RotateOptions = {
  dryRun?: boolean;
  targetKeyId?: string | null;
  fromKeyId?: string | null;
};

type RotateResult = {
  updated: number;
  skipped: number;
  failed: number;
  targetKeyId: string;
  fromKeyId: string | null;
  sourceKeyDistribution: Record<string, number>;
};

type LockResult<T> = {
  acquired: boolean;
  result?: T;
};

const ROTATION_LOCK_KEY = 7345981201n;

async function tryAcquireRotationLock() {
  const rows = await prisma.$queryRaw<Array<{ acquired: boolean }>>
    `SELECT pg_try_advisory_lock(${ROTATION_LOCK_KEY}) AS acquired`;
  return rows[0]?.acquired === true;
}

async function releaseRotationLock() {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${ROTATION_LOCK_KEY})`;
}

export async function withRotationLock<T>(action: () => Promise<T>): Promise<LockResult<T>> {
  const acquired = await tryAcquireRotationLock();
  if (!acquired) {
    return { acquired };
  }
  try {
    const result = await action();
    return { acquired, result };
  } finally {
    await releaseRotationLock();
  }
}

export async function rotateSsoSecrets(options: RotateOptions = {}): Promise<RotateResult> {
  const dryRun = Boolean(options.dryRun);
  const currentKeyId = getCurrentKeyId();
  const targetKeyId = options.targetKeyId?.trim() || currentKeyId;
  const fromKeyId = options.fromKeyId?.trim() || null;

  const configs = await prisma.ssoConfig.findMany({
    where: { clientSecretEnc: { not: null } },
    select: { id: true, provider: true, clientSecretEnc: true }
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const sourceKeyDistribution: Record<string, number> = {};

  for (const config of configs) {
    const payload = config.clientSecretEnc;
    if (!payload) {
      skipped += 1;
      continue;
    }

    const payloadKeyId = getSecretKeyId(payload);
    const sourceKeyId = payloadKeyId ?? 'unknown';
    sourceKeyDistribution[sourceKeyId] = (sourceKeyDistribution[sourceKeyId] ?? 0) + 1;

    if (fromKeyId && sourceKeyId !== fromKeyId) {
      skipped += 1;
      continue;
    }

    if (sourceKeyId === targetKeyId) {
      skipped += 1;
      continue;
    }

    try {
      const plaintext = decryptSecret(payload);
      const nextPayload = encryptSecretWithKeyId(plaintext, targetKeyId);
      if (!dryRun) {
        await prisma.ssoConfig.update({
          where: { id: config.id },
          data: { clientSecretEnc: nextPayload }
        });
      }
      updated += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(`Failed to rotate SSO secret for ${config.provider}: ${message}`);
    }
  }

  return {
    updated,
    skipped,
    failed,
    targetKeyId,
    fromKeyId,
    sourceKeyDistribution
  };
}
