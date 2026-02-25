import { getServerAuthSession } from '../../lib/auth';
import AdminTabs from './AdminTabs';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerAuthSession();
    const roles = session?.user?.roles ?? [];

    if (!session || !roles.includes('admin')) {
        return (
            <div className="px-6 md:px-12 py-16">
                <div className="glass rounded-[32px] p-8 max-w-xl">
                    <h1 className="font-serif text-2xl">Admin access required</h1>
                    <p className="text-ink-200 mt-4">
                        Your account does not have permission to access the admin area.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            <AdminTabs />
            {children}
        </>
    );
}
