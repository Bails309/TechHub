import { getServerAuthSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProfileImageUploader from '@/components/ProfileImageUploader';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import { updateProfileImage } from './actions';
import { User, Mail, Shield, Key } from 'lucide-react';

export default async function ProfilePage() {
    const session = await getServerAuthSession();

    if (!session) {
        redirect('/auth/signin');
    }

    const isLocalUser = session.user.authProvider === 'credentials';

    return (
        <div className="px-6 md:px-12 py-12 max-w-4xl mx-auto space-y-12">
            <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Settings</p>
                <h1 className="font-serif text-4xl text-ink-50">User Profile</h1>
            </header>

            <div className="grid gap-8 md:grid-cols-3">
                {/* Left Column: Profile Icon */}
                <div className="md:col-span-1">
                    <div className="card-panel p-8 flex flex-col items-center">
                        <ProfileImageUploader
                            currentImage={session.user.image}
                            onUpdate={updateProfileImage}
                        />
                    </div>
                </div>

                {/* Right Column: Info & Security */}
                <div className="md:col-span-2 space-y-8">
                    {/* Account Info */}
                    <section className="card-panel p-8 space-y-6">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                            <User className="h-5 w-5 text-ocean-400" />
                            <h2 className="text-lg font-medium text-ink-100">Account Information</h2>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Full Name</label>
                                <p className="text-ink-200 font-medium">{session.user.name || 'Not set'}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold flex items-center gap-1.5">
                                    <Mail className="h-3 w-3" /> Email Address
                                </label>
                                <p className="text-ink-200 font-medium">{session.user.email}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold flex items-center gap-1.5">
                                    <Shield className="h-3 w-3" /> Account Type
                                </label>
                                <p className="text-ink-200 font-medium capitalize">{session.user.authProvider || 'Local'}</p>
                            </div>
                        </div>
                    </section>

                    {/* Security / Password */}
                    {isLocalUser && (
                        <section className="card-panel p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <Key className="h-5 w-5 text-amber-400" />
                                <h2 className="text-lg font-medium text-ink-100">Security</h2>
                            </div>

                            <div className="max-w-md">
                                <p className="text-sm text-ink-300 mb-6">
                                    Change your password to keep your account secure.
                                </p>
                                <ChangePasswordForm />
                            </div>
                        </section>
                    )}

                    {!isLocalUser && (
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-center">
                            <p className="text-xs text-ink-400 italic">
                                Password management is handled by your identity provider ({session.user.authProvider}).
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
