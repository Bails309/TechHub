import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';
import DeleteAppForm from '@/components/DeleteAppForm';
import EditAppForm from '@/components/EditAppForm';
import NewAppForm from '@/components/NewAppForm';
import { createApp, deleteApp, updateApp } from './actions';

export default async function AdminPage() {
  const session = await getServerAuthSession();
  const roles = session?.user?.roles ?? [];

  if (!session || !roles.includes('admin')) {
    return (
      <div className="px-6 md:px-12 py-16">
        <div className="glass rounded-[32px] p-8 max-w-xl">
          <h1 className="font-serif text-2xl">Admin access required</h1>
          <p className="text-ink-200 mt-4">
            Your account does not have permission to manage the app catalogue.
          </p>
        </div>
      </div>
    );
  }

  const [apps, rolesList, categories] = await Promise.all([
    prisma.appLink.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.appLink.findMany({
      distinct: ['category'],
      select: { category: true },
      where: { category: { not: null } },
      orderBy: { category: 'asc' }
    })
  ]);

  const categoryOptions = categories
    .map((item) => item.category)
    .filter((item): item is string => Boolean(item));

  const categorySelectOptions = [
    { value: 'none', label: 'Select existing' },
    ...categoryOptions.map((category) => ({ value: category, label: category }))
  ];

  const audienceOptions = [
    { value: 'PUBLIC', label: 'Public' },
    { value: 'AUTHENTICATED', label: 'Authenticated' },
    { value: 'ROLE', label: 'Role-based' }
  ];

  const roleOptions = [
    { value: '', label: 'No role required (public/authenticated)' },
    ...rolesList.map((role) => ({ value: role.id, label: role.name }))
  ];

  return (
    <div className="px-6 md:px-12 py-12 space-y-8">
      <section className="glass rounded-[36px] p-8">
        <h1 className="font-serif text-3xl">Admin command centre</h1>
        <p className="text-ink-200 mt-2">
          Add, categorise, and lock apps to the right audiences.
        </p>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Add a new app</h2>
        <NewAppForm
          categorySelectOptions={categorySelectOptions}
          audienceOptions={audienceOptions}
          roleOptions={roleOptions}
          action={createApp}
        />
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Current catalogue</h2>
        <div className="space-y-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl border border-ink-800 px-5 py-4 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold">{app.name}</p>
                  <p className="text-xs text-ink-400">{app.url}</p>
                  {app.category ? (
                    <p className="text-xs text-ink-300">{app.category}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <details className="group">
                    <summary className="cursor-pointer list-none rounded-full border border-ink-700 px-4 py-2 text-xs text-ink-200 hover:border-ink-400 transition">
                      Edit
                    </summary>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <EditAppForm
                        app={app}
                        categorySelectOptions={categorySelectOptions}
                        audienceOptions={audienceOptions}
                        roleOptions={roleOptions}
                        action={updateApp}
                      />
                    </div>
                  </details>
                  <DeleteAppForm id={app.id} name={app.name} action={deleteApp} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
