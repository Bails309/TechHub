import { prisma } from '../src/lib/prisma';
import { getCurrentKeyId } from '../src/lib/crypto';
import { rotateSsoSecrets, withRotationLock } from '../src/lib/ssoRotation';

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    return null;
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.env.SSO_ROTATE_DRY_RUN === 'true';
  const currentKeyId = getCurrentKeyId();
  const targetKeyId = getArgValue('--target-key-id') || process.env.SSO_ROTATE_TARGET_KEY_ID || currentKeyId;
  const fromKeyId = getArgValue('--from-key-id') || process.env.SSO_ROTATE_FROM_KEY_ID || null;

  const lock = await withRotationLock(() =>
    rotateSsoSecrets({
      dryRun,
      targetKeyId,
      fromKeyId
    })
  );

  if (!lock.acquired || !lock.result) {
    console.log('Rotation is already running; exiting.');
    return;
  }

  const result = lock.result;

  const mode = dryRun ? 'DRY RUN' : 'APPLIED';
  const sourceSummary = Object.entries(result.sourceKeyDistribution)
    .map(([keyId, count]) => `${keyId}=${count}`)
    .join(', ');
  console.log(
    `SSO secret rotation ${mode}: updated=${result.updated}, skipped=${result.skipped}, failed=${result.failed}`
  );
  console.log(`Source key distribution: ${sourceSummary || 'none'}`);
  console.log(`Target key id: ${result.targetKeyId}`);
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
