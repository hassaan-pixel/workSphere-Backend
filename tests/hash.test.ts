import { hashPassword, comparePassword } from '../src/common/utils/hash.utils';

describe('Password Hashing Tests', () => {
  const plainText = 'TestPassword123!@#';

  it('should hash a password and produce a distinct bcrypt hash', async () => {
    const hash = await hashPassword(plainText);
    expect(hash).toBeDefined();
    expect(hash).not.toBe(plainText);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
  });

  it('should verify correct password match', async () => {
    const hash = await hashPassword(plainText);
    const isValid = await comparePassword(plainText, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const hash = await hashPassword(plainText);
    const isValid = await comparePassword('WrongPassword!', hash);
    expect(isValid).toBe(false);
  });
});
