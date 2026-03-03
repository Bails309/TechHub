import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const configs = await prisma.ssoConfig.findMany();
        console.log('SSO Configurations in DB:');
        configs.forEach(c => {
            console.log(`- ${c.provider}: enabled=${c.enabled}`);
        });
    } catch (err) {
        console.error('Failed to fetch SSO configs:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
