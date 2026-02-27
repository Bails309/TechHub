import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin' }
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'staff' },
    update: {},
    create: { name: 'staff' }
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@techhub.local';
  let adminPassword = process.env.ADMIN_PASSWORD;
  // If no ADMIN_PASSWORD provided, generate a secure one-time password and
  // print it to stdout exactly once during seeding. Do NOT commit defaults.
  if (!adminPassword) {
    // Generate a URL-safe base64 password
    const raw = crypto.randomBytes(16).toString('base64');
    adminPassword = raw.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    console.log(`SEED: Generated admin password for ${adminEmail}: ${adminPassword}`);
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  const adminUser = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          mustChangePassword: existingAdmin.passwordHash
            ? await bcrypt.compare(adminPassword, existingAdmin.passwordHash)
            : existingAdmin.mustChangePassword
        }
      })
    : await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'TechHub Admin',
          passwordHash: await bcrypt.hash(adminPassword, SALT_ROUNDS),
          mustChangePassword: true
        }
      });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id }
  });

  const existingAppCount = await prisma.appLink.count();
  if (existingAppCount > 0) {
    return;
  }

  const sampleApps = [
    {
      name: 'Microsoft 365 Admin',
      url: 'https://admin.microsoft.com',
      category: 'Admin',
      description: 'Manage users, licenses, and policies',
      audience: 'ROLE' as const,
      roleId: adminRole.id
    },
    {
      name: 'GitHub Enterprise',
      url: 'https://github.com',
      category: 'Engineering',
      description: 'Repositories and pull requests',
      audience: 'AUTHENTICATED' as const
    },
    {
      name: 'Notion Workspace',
      url: 'https://www.notion.so',
      category: 'Productivity',
      description: 'Docs, project plans, and team wikis',
      audience: 'AUTHENTICATED' as const
    },
    {
      name: 'Status Page',
      url: 'https://status.example.com',
      category: 'Operations',
      description: 'Service uptime and incident history',
      audience: 'PUBLIC' as const
    },
    {
      name: 'Service Desk',
      url: 'https://servicedesk.example.com',
      category: 'Support',
      description: 'Tickets and incident response',
      audience: 'ROLE' as const,
      roleId: staffRole.id
    }
  ];

  // Ensure Category records exist for sample apps and build a name->id map
  const uniqueCategories = Array.from(new Set(sampleApps.map(s => s.category).filter(Boolean)));
  const categoryMap = new Map<string, string>();
  for (const [i, name] of uniqueCategories.entries()) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, order: i }
    });
    categoryMap.set(name, cat.id);
  }

  for (const app of sampleApps) {
    const existing = await prisma.appLink.findFirst({ where: { url: app.url } });
    if (existing) {
      continue;
    }

    const { category, ...rest } = app as any;
    const data: any = { ...rest };
    if (category) {
      const categoryId = categoryMap.get(category);
      if (categoryId) data.categoryId = categoryId;
    }

    await prisma.appLink.create({ data });
  }
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
