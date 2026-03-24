const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

async function main() {
    console.log('--- Database Synchronization Check ---');

    if (!process.env.DATABASE_URL) {
        console.log('Skipping: DATABASE_URL not set.');
        return;
    }

    try {
        console.log('Running: npx -y prisma@5.18.0 db push --schema=./prisma/schema.prisma --accept-data-loss --skip-generate');
        // The standalone build strips devDependencies and node_modules/.bin.
        // We use npx -y prisma@version to force it to download and execute the CLI.
        execSync('npx -y prisma@5.18.0 db push --schema=./prisma/schema.prisma --accept-data-loss --skip-generate', {
            stdio: 'inherit',
            env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: 'true' }
        });
        console.log('Database synchronization successful.');

        // Compute schema hash and store in DB
        const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
        if (fs.existsSync(schemaPath)) {
            const schemaContent = fs.readFileSync(schemaPath, 'utf8');
            // Normalize line endings to prevent hash mismatch between Windows (CRLF) and Linux (LF)
            const normalizedContent = schemaContent.replace(/\r\n/g, '\n');
            const hash = crypto.createHash('sha256').update(normalizedContent).digest('hex');

            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();

            await prisma.systemState.upsert({
                where: { id: 'SCHEMA_HASH' },
                update: { value: hash },
                create: { id: 'SCHEMA_HASH', value: hash }
            });
            console.log(`Stored schema hash: ${hash}`);
            await prisma.$disconnect();
        } else {
            console.warn('Could not find schema.prisma to hash.');
        }

        // Run seed script ONLY on a brand-new database.  We detect
        // "first run" by the absence of a SEEDED flag in SystemState.
        // Once the seed completes it writes SEEDED=true, so subsequent
        // container restarts (even after schema migrations) skip this step.
        const seedPath = path.join(__dirname, '..', 'prisma', 'seed.js');
        if (fs.existsSync(seedPath)) {
            const { PrismaClient: PC } = require('@prisma/client');
            const seedCheck = new PC();
            try {
                const flag = await seedCheck.systemState.findUnique({ where: { id: 'SEEDED' } });
                if (!flag) {
                    // Before running seed, check if this is a genuinely fresh
                    // database or an existing setup that just lacks the flag
                    // (e.g. first deploy after this code was added).
                    const userCount = await seedCheck.user.count();
                    if (userCount > 0) {
                        // Existing data found — this is NOT a fresh setup.
                        // Set the flag and skip the seed to avoid overwriting
                        // production data (admin password, mustChangePassword, etc.)
                        console.log(`Existing database detected (${userCount} users) — setting SEEDED flag, skipping seed.`);
                        await seedCheck.systemState.create({ data: { id: 'SEEDED', value: 'true' } });
                    } else {
                        console.log('First-time setup detected — running database seed...');
                        execSync(`node ${seedPath}`, {
                            stdio: 'inherit',
                            env: { ...process.env }
                        });
                        // Mark seed as complete so it never runs again
                        await seedCheck.systemState.create({ data: { id: 'SEEDED', value: 'true' } });
                        console.log('Database seed complete.');
                    }
                } else {
                    console.log('Database already seeded — skipping seed.');
                }
            } finally {
                await seedCheck.$disconnect();
            }
        } else {
            console.warn('Seed script not found — skipping seed.');
        }
    } catch (error) {
        console.error('Database synchronization failed:', error.message);
        // We don't exit 1 here because we want the app to try and start anyway
        // (it might still work if the schema change was minor)
    }
}

main();
