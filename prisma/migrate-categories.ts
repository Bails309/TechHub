import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting category migration...');

    // 1. Get all unique category strings from AppLink
    // The Prisma schema no longer exposes the legacy `category` string column,
    // so read it via a raw SQL query to avoid type errors.
    const apps = await prisma.$queryRaw<{
        id: string;
        category: string | null;
    }[]>`SELECT id, category FROM "AppLink" WHERE "category" IS NOT NULL`;

    const uniqueCategories = Array.from(new Set(apps.map(a => a.category as string)));

    console.log(`Found ${uniqueCategories.length} unique categories: ${uniqueCategories.join(', ')}`);

    // 2. Create Category records
    for (const catName of uniqueCategories) {
        await prisma.category.upsert({
            where: { name: catName },
            update: {},
            create: {
                name: catName,
                order: 0,
            },
        });
    }

    // 3. Link AppLinks to Categories
    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.name, c.id]));

    let count = 0;
    for (const app of apps) {
        const categoryId = categoryMap.get(app.category!);
        if (categoryId) {
            await prisma.appLink.update({
                where: { id: app.id },
                data: { categoryId },
            });
            count++;
        }
    }

    console.log(`Migration complete. Updated ${count} apps.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
