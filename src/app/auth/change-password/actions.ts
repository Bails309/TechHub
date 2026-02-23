'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';
import { hashPassword, verifyPassword, validatePasswordComplexity } from '@/lib/password';
import { getPasswordPolicy } from '@/lib/passwordPolicy';

export type ChangePasswordState = {
  status: 'idle' | 'success' | 'error';
  message: string;
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

  const historyDepth = Math.max(policy.historyCount - 1, 0);
  const recentHistory = await prisma.passwordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: historyDepth
  });

  for (const entry of recentHistory) {
    const reused = await verifyPassword(parsed.data.newPassword, entry.hash);
    if (reused) {
      return { status: 'error', message: 'New password was used recently' };
    }
  }

  const nextHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordHistory.create({
      data: { userId: user.id, hash: user.passwordHash! }
    });
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: nextHash, mustChangePassword: false }
    });
    const excess = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: historyDepth,
      select: { id: true }
    });
    if (excess.length) {
      await tx.passwordHistory.deleteMany({
        where: { id: { in: excess.map((entry) => entry.id) } }
      });
    }
  });

  return { status: 'success', message: 'Password updated' };
}
