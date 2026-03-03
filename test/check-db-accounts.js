const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const stats = await prisma.account.groupBy({
            by: ['provider'],
            _count: { provider: true }
        });
        console.log('--- ACCOUNT_STATS_START ---');
        console.log(JSON.stringify(stats));
        console.log('--- ACCOUNT_STATS_END ---');
    } catch (err) {
        console.error('Failed to fetch account stats:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(err => {
    console.error('Fatal error in script:', err);
    process.exit(1);
});
