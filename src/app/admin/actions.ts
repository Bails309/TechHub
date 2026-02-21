'use server';

import { z } from 'zod';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';

const appSchemaBase = z.object({
  name: z.string().min(2),
  url: z.string().url(),
  categorySelect: z.string().optional(),
  categoryNew: z.string().optional(),
  description: z.string().optional(),
  audience: z.enum(['PUBLIC', 'AUTHENTICATED', 'ROLE']),
  roleId: z.string().optional()
});

const appSchema = appSchemaBase.refine(
  (data) => (data.audience === 'ROLE' ? Boolean(data.roleId) : true),
  {
    message: 'Role is required for role-based apps',
    path: ['roleId']
  }
);

const updateSchema = appSchemaBase
  .extend({
    id: z.string().min(1)
  })
  .refine((data) => (data.audience === 'ROLE' ? Boolean(data.roleId) : true), {
    message: 'Role is required for role-based apps',
    path: ['roleId']
  });

const uploadSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, { message: 'Empty file' })
  .refine((file) => {
    if (file.type.startsWith('image/')) {
      return true;
    }
    const extension = path.extname(file.name).toLowerCase();
    return extension === '.svg';
  }, { message: 'Invalid file type' });

async function saveIcon(file: File) {
  const parsed = uploadSchema.safeParse(file);
  if (!parsed.success) {
    return undefined;
  }

  const extension =
    path.extname(file.name) || `.${file.type.split('/')[1] ?? 'png'}`;
  const filename = `${randomUUID()}${extension}`;
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function createApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = appSchema.parse({
    name: formData.get('name'),
    url: formData.get('url'),
    categorySelect: formData.get('categorySelect') || undefined,
    categoryNew: formData.get('categoryNew') || undefined,
    description: formData.get('description') || undefined,
    audience: formData.get('audience'),
    roleId: formData.get('roleId') || undefined
  });

  const iconFile = formData.get('icon');
  const iconPath = iconFile instanceof File ? await saveIcon(iconFile) : undefined;

  const normalizedNewCategory = payload.categoryNew?.trim();
  const normalizedSelect = payload.categorySelect?.trim();
  const category =
    normalizedNewCategory && normalizedNewCategory.length > 0
      ? normalizedNewCategory
      : normalizedSelect && normalizedSelect !== 'none'
        ? normalizedSelect
        : undefined;

  await prisma.appLink.create({
    data: {
      name: payload.name,
      url: payload.url,
      category,
      description: payload.description,
      audience: payload.audience,
      roleId: payload.audience === 'ROLE' ? payload.roleId : null,
      icon: iconPath
    }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function deleteApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return;
  }

  await prisma.appLink.delete({
    where: { id }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function updateApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = updateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    url: formData.get('url'),
    categorySelect: formData.get('categorySelect') || undefined,
    categoryNew: formData.get('categoryNew') || undefined,
    description: formData.get('description') || undefined,
    audience: formData.get('audience'),
    roleId: formData.get('roleId') || undefined
  });

  const iconFile = formData.get('icon');
  const iconPath = iconFile instanceof File ? await saveIcon(iconFile) : undefined;
  const iconRemove = formData.get('iconRemove') === 'on';

  const normalizedNewCategory = payload.categoryNew?.trim();
  const normalizedSelect = payload.categorySelect?.trim();
  const category =
    normalizedNewCategory && normalizedNewCategory.length > 0
      ? normalizedNewCategory
      : normalizedSelect && normalizedSelect !== 'none'
        ? normalizedSelect
        : null;

  await prisma.appLink.update({
    where: { id: payload.id },
    data: {
      name: payload.name,
      url: payload.url,
      category,
      description: payload.description,
      audience: payload.audience,
      roleId: payload.audience === 'ROLE' ? payload.roleId : null,
      ...(iconRemove ? { icon: null } : {}),
      ...(iconPath ? { icon: iconPath } : {})
    }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}
