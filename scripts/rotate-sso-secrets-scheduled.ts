import { prisma } from '../src/lib/prisma';
import { rotateSsoSecrets, withRotationLock } from '../src/lib/ssoRotation';

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  if (process.env.SSO_ROTATE_SCHEDULED !== 'true') {
    console.log('SSO scheduled rotation is disabled. Set SSO_ROTATE_SCHEDULED=true to enable.');
    return;
  }

  const minHours = parseNumber(process.env.SSO_ROTATE_MIN_INTERVAL_HOURS, 0);
  if (minHours > 0) {
    const lastRun = await prisma.ssoAudit.findFirst({
      where: { action: 'rotate' },
      orderBy: { createdAt: 'desc' }
    });
    if (lastRun) {
      const elapsedMs = Date.now() - lastRun.createdAt.getTime();
      if (elapsedMs < minHours * 60 * 60 * 1000) {
        console.log(
          `Skipping rotation; last run was ${(elapsedMs / 3600000).toFixed(2)}h ago (min ${minHours}h).`
        );
        return;
      }
    }
  }

  const dryRun = process.env.SSO_ROTATE_DRY_RUN === 'true';
  const targetKeyId = process.env.SSO_ROTATE_TARGET_KEY_ID || null;
  const fromKeyId = process.env.SSO_ROTATE_FROM_KEY_ID || null;

  const lock = await withRotationLock(() =>
    rotateSsoSecrets({
      dryRun,
      targetKeyId,
      fromKeyId
    })
  );

  if (!lock.acquired || !lock.result) {
    console.log('Rotation already in progress; skipping scheduled run.');
    return;
  }

  const result = lock.result;

  await prisma.ssoAudit.create({
    data: {
      provider: 'system',
      action: 'rotate',
      changes: {
        trigger: 'scheduled',
        dryRun,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        targetKeyId: result.targetKeyId,
        fromKeyId: result.fromKeyId,
        sourceKeyDistribution: result.sourceKeyDistribution,
        minIntervalHours: minHours
      }
    }
  });

  const mode = dryRun ? 'DRY RUN' : 'APPLIED';
  console.log(
    `SSO scheduled rotation ${mode}: updated=${result.updated}, skipped=${result.skipped}, failed=${result.failed}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
