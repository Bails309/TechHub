'use server';

import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getServerAuthSession } from '../../../lib/auth';
import { validateCsrf } from '../../../lib/csrf';
import { hashPassword, verifyPassword, validatePasswordComplexity } from '../../../lib/password';
import { getPasswordPolicy } from '../../../lib/passwordPolicy';
import { writeAuditLog } from '../../../lib/audit';

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
  if (!(await validateCsrf(formData))) {
    return { status: 'error', message: 'Invalid CSRF token' };
  }
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

  // Fetch recent password history and current hash outside of a transaction
  const recent = await prisma.passwordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: policy.historyCount
  });
  // Run expensive bcrypt checks outside of any DB transaction/lock
  for (const entry of recent) {
    if (await verifyPassword(parsed.data.newPassword, entry.hash)) {
      return { status: 'error', message: 'New password was used recently' };
    }
  }

  const nextHash = await hashPassword(parsed.data.newPassword);

  // Now open a short transaction to atomically update the password and history.
  // Re-fetch the current hash and ensure it hasn't changed (optimistic concurrency).
  await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!current?.passwordHash) {
      throw new Error('Local account not found');
    }

    // If the current stored hash has changed since we performed the in-memory checks,
    // abort so the caller can retry (prevents silent overwrite from concurrent changes).
    if (current.passwordHash !== user.passwordHash) {
      throw new Error('Password changed concurrently; please try again');
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

  writeAuditLog({
    category: 'admin',
    action: 'password_changed',
    actorId: session.user.id,
    targetId: session.user.id,
    details: { forced: user.mustChangePassword },
  });

  return { status: 'success', message: 'Password updated' };
}
