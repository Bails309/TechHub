import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const storage = await import('../src/lib/storage');

describe('storage adapter (local)', () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  beforeAll(async () => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  });

  afterAll(async () => {
    // clean uploads directory
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const f of files) fs.unlinkSync(path.join(uploadsDir, f));
      fs.rmdirSync(uploadsDir);
    } catch {
      // ignore
    }
  });

  it('saves and deletes a file locally', async () => {
    // create a fake File-like object
    const file = {
      name: 'test.png',
      type: 'image/png',
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    } as unknown as File;

    const saved = await storage.saveIcon(file);
    expect(typeof saved).toBe('string');
    // path should start with /uploads/
    expect(saved.startsWith('/uploads/')).toBe(true);
    const full = path.join(process.cwd(), saved.startsWith('/') ? saved.slice(1) : saved);
    expect(fs.existsSync(full)).toBe(true);

    await storage.deleteIcon(saved);
    expect(fs.existsSync(full)).toBe(false);
  });

  it('prevents path-traversal deletes (does not remove files outside uploads)', async () => {
    const dangerPath = path.join(process.cwd(), 'danger.txt');
    try {
      fs.writeFileSync(dangerPath, 'safe');
      // attempt to delete using a traversal path that starts with uploads/
      await storage.deleteIcon('/uploads/../danger.txt');
      // the file must still exist if traversal was rejected
      expect(fs.existsSync(dangerPath)).toBe(true);
    } finally {
      try {
        if (fs.existsSync(dangerPath)) fs.unlinkSync(dangerPath);
      } catch {
        // ignore
      }
    }
  });
});
