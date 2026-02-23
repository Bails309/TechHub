import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const defaultPasswordPolicy = {
  minLength: 12,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSymbol: true,
  historyCount: 5
};

export type PasswordPolicy = typeof defaultPasswordPolicy;

export function validatePasswordComplexity(password: string, policy: PasswordPolicy) {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`;
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (policy.requireLower && !/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter';
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    return 'Password must include a number';
  }
  if (policy.requireSymbol && !/[^A-Za-z\d]/.test(password)) {
    return 'Password must include a symbol';
  }
  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
