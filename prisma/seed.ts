import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMeNow!';

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

  for (const app of sampleApps) {
    const existing = await prisma.appLink.findFirst({ where: { url: app.url } });
    if (existing) {
      continue;
    }

    await prisma.appLink.create({
      data: app
    });
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
