const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const configs = await prisma.ssoConfig.findMany();
        console.log('--- SSO_CONFIG_START ---');
        console.log(JSON.stringify(configs));
        console.log('--- SSO_CONFIG_END ---');
    } catch (err) {
        console.error('Failed to fetch SSO configs:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(err => {
    console.error('Fatal error in script:', err);
    process.exit(1);
});
