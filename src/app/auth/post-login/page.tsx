import { redirect } from 'next/navigation';
import { getServerAuthSession } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function PostLoginPage() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect('/auth/signin');
  }

  if (session.user.mustChangePassword) {
    redirect('/auth/change-password');
  }

  redirect('/');
}
