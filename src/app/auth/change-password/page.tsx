'use client';

import ChangePasswordForm from '@/components/ChangePasswordForm';

export default function ChangePasswordPage() {
  const handleSuccess = () => {
    // Force a hard reload to ensure middleware sees the new cookie
    window.location.assign('/');
  };

  return (
    <div className="px-6 md:px-12 py-12">
      <div className="max-w-xl mx-auto card-panel md:p-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-300">Security</p>
          <h1 className="font-serif text-3xl">Update your password</h1>
          <p className="text-sm text-ink-200 mt-2">
            Set a new password to finish activating your account.
          </p>
        </div>

        <ChangePasswordForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
