import { prisma } from './prisma';
import { defaultPasswordPolicy, PasswordPolicy } from './password';

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const policy = await prisma.passwordPolicy.findFirst();
    if (!policy) {
      return defaultPasswordPolicy;
    }

    return {
      minLength: policy.minLength,
      requireUpper: policy.requireUpper,
      requireLower: policy.requireLower,
      requireNumber: policy.requireNumber,
      requireSymbol: policy.requireSymbol,
      historyCount: policy.historyCount
    };
  } catch {
    return defaultPasswordPolicy;
  }
}
