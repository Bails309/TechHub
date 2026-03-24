import { describe, it, expect } from 'vitest';
import { validatePasswordComplexity, hashPassword, verifyPassword, defaultPasswordPolicy } from '../src/lib/password';

describe('validatePasswordComplexity', () => {
    const policy = defaultPasswordPolicy;

    it('returns null for a valid password', () => {
        expect(validatePasswordComplexity('Str0ng!Pass#1', policy)).toBeNull();
    });

    it('rejects passwords shorter than minLength', () => {
        expect(validatePasswordComplexity('Sh0rt!', policy)).toContain('at least');
    });

    it('rejects passwords without uppercase letters', () => {
        expect(validatePasswordComplexity('lowercaseonly1!a', policy)).toContain('uppercase');
    });

    it('rejects passwords without lowercase letters', () => {
        expect(validatePasswordComplexity('UPPERCASEONLY1!A', policy)).toContain('lowercase');
    });

    it('rejects passwords without numbers', () => {
        expect(validatePasswordComplexity('NoNumbersHere!!a', policy)).toContain('number');
    });

    it('rejects passwords without symbols', () => {
        expect(validatePasswordComplexity('NoSymbols1234Ab', policy)).toContain('symbol');
    });

    it('respects custom policy minLength', () => {
        const custom = { ...policy, minLength: 20 };
        expect(validatePasswordComplexity('Str0ng!Pass#1', custom)).toContain('at least 20');
    });

    it('allows passwords when requirements are disabled', () => {
        const lax = { minLength: 1, requireUpper: false, requireLower: false, requireNumber: false, requireSymbol: false, historyCount: 0 };
        expect(validatePasswordComplexity('a', lax)).toBeNull();
    });
});

describe('hashPassword and verifyPassword', () => {
    it('hashes and verifies a password correctly', async () => {
        const hash = await hashPassword('MySecureP@ss1');
        expect(typeof hash).toBe('string');
        expect(hash).not.toBe('MySecureP@ss1');
        expect(await verifyPassword('MySecureP@ss1', hash)).toBe(true);
    });

    it('rejects an incorrect password', async () => {
        const hash = await hashPassword('CorrectPass1!');
        expect(await verifyPassword('WrongPass1!', hash)).toBe(false);
    });

    it('produces different hashes for the same password (salted)', async () => {
        const h1 = await hashPassword('SamePass!123');
        const h2 = await hashPassword('SamePass!123');
        expect(h1).not.toBe(h2);
    });
});
