'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';
import { hashPassword, verifyPassword, validatePasswordComplexity } from '@/lib/password';
import { getPasswordPolicy } from '@/lib/passwordPolicy';

export type ChangePasswordState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  pending?: boolean;
};

const changeSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1)
});

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return { status: 'error', message: 'Not signed in' };
  }

  const parsed = changeSchema.safeParse({
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? '')
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Invalid password details' };
  }

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { status: 'error', message: 'New passwords do not match' };
  }

  const policy = await getPasswordPolicy();
  const complexityError = validatePasswordComplexity(parsed.data.newPassword, policy);
  if (complexityError) {
    return { status: 'error', message: complexityError };
  }


  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.passwordHash) {
    return { status: 'error', message: 'Local account not found' };
  }

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return { status: 'error', message: 'Current password is incorrect' };
  }

  const reuseCurrent = await verifyPassword(parsed.data.newPassword, user.passwordHash);
  if (reuseCurrent) {
    return { status: 'error', message: 'New password must be different from current password' };
  }

  // historyDepth not needed when checking recent entries inside transaction
  // Use a transaction and lock the user row to prevent concurrent password changes
  const nextHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    // Lock the user row for this transaction to serialize concurrent password changes
    // Note: raw query uses the Prisma client transaction context
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;

    const current = await tx.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!current?.passwordHash) {
      throw new Error('Local account not found');
    }

    // Check reuse against current and recent history inside the lock
    if (await verifyPassword(parsed.data.newPassword, current.passwordHash)) {
      throw new Error('New password must be different from current password');
    }

    const recent = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: policy.historyCount
    });

    for (const entry of recent) {
      if (await verifyPassword(parsed.data.newPassword, entry.hash)) {
        throw new Error('New password was used recently');
      }
    }

    await tx.passwordHistory.create({ data: { userId: user.id, hash: nextHash } });
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: nextHash, mustChangePassword: false } });

    const excess = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: policy.historyCount,
      select: { id: true }
    });
    if (excess.length) {
      await tx.passwordHistory.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
    }
  });

  return { status: 'success', message: 'Password updated' };
}
