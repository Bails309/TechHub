'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShieldCheck, LogIn, Menu, X, LayoutDashboard, Settings, User as UserIcon } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './ThemeProvider';
import { chooseLogo } from '../lib/siteConfig';

export default function SideNav({ logo, logoLight, logoDark }: { logo?: string; logoLight?: string; logoDark?: string }) {
    const { data: session } = useSession();
    const user = session?.user;
    const roles = user?.roles ?? [];
    const isAuthenticated = Boolean(user);
    const isLocalUser = user?.authProvider === 'credentials';
    const { theme } = useTheme();
    const pathname = usePathname();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const isAdminPanel = pathname?.startsWith('/admin');

    return (
        <>
            {/* Mobile Hamburger Toggle */}
            <button
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/80 dark:bg-ink-900/80 backdrop-blur-md border border-ink-200 dark:border-ink-800 text-ink-900 dark:text-ink-50 shadow-lg transition-colors"
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                aria-label="Toggle menu"
            >
                {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Side Navigation Rail */}
            <aside
                className={`fixed top-0 left-0 z-40 w-64 lg:w-64 glass flex flex-col justify-between transition-transform duration-300 ease-in-out border-r border-ink-200/50 dark:border-white/5 h-screen max-h-screen supports-[height:100dvh]:h-[100dvh] supports-[max-height:100dvh]:max-h-[100dvh]
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
            >
                <div className="flex flex-col flex-1 py-8 px-4 overflow-y-auto min-h-0">
                    {/* Logo Section */}
                    <Link
                        href="/"
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 mb-12 mx-auto lg:mx-0 ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        <div className="h-12 w-auto shrink-0">
                            <img
                                src={chooseLogo(theme, { logo, logoLight, logoDark })}
                                alt="TechHub logo"
                                className="h-full w-full object-contain"
                            />
                        </div>
                    </Link>

                    {/* Navigation Links */}
                    <nav className="flex flex-col gap-2">
                        <Link
                            href="/"
                            onClick={() => setIsMobileOpen(false)}
                            className={`flex items-center gap-4 px-4 pl-3 py-3 rounded-xl transition-all group ${pathname === '/' ? 'bg-ocean-100 dark:bg-ocean-500/10 text-ocean-900 dark:text-white font-semibold' : 'text-ink-500 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-ink-50 dark:hover:bg-ink-800/50 font-semibold'} ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <LayoutDashboard size={20} className={pathname === '/' ? 'text-ocean-600 dark:text-ocean-400' : 'text-ink-400 dark:text-ink-400 group-hover:text-ink-600 dark:group-hover:text-white'} />
                            <span className="lg:inline whitespace-nowrap">Dashboard</span>
                        </Link>

                        {roles.includes('admin') && (
                            <Link
                                href="/admin"
                                onClick={() => setIsMobileOpen(false)}
                                className={`flex items-center gap-4 px-4 pl-3 py-3 rounded-xl transition-all group ${isAdminPanel ? 'bg-ocean-100 dark:bg-ocean-500/10 text-ocean-900 dark:text-white font-semibold' : 'text-ink-500 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-ink-50 dark:hover:bg-ink-800/50 font-semibold'} ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <Settings size={20} className={isAdminPanel ? 'text-ocean-600 dark:text-ocean-400' : 'text-ink-400 dark:text-ink-400 group-hover:text-ink-600 dark:group-hover:text-white'} />
                                <span className="lg:inline whitespace-nowrap">Administration</span>
                            </Link>
                        )}

                        {isAuthenticated && (
                            <Link
                                href="/profile"
                                onClick={() => setIsMobileOpen(false)}
                                className={`flex items-center gap-4 px-4 pl-3 py-3 rounded-xl transition-all group ${pathname === '/profile' ? 'bg-ocean-100 dark:bg-ocean-500/10 text-ocean-900 dark:text-white font-semibold' : 'text-ink-500 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-ink-50 dark:hover:bg-ink-800/50 font-semibold'} ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <UserIcon size={20} className={pathname === '/profile' ? 'text-ocean-600 dark:text-ocean-400' : 'text-ink-400 dark:text-ink-400 group-hover:text-ink-600 dark:group-hover:text-white'} />
                                <span className="lg:inline whitespace-nowrap">Profile</span>
                            </Link>
                        )}
                    </nav>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-ink-200/50 dark:border-white/5 flex flex-col gap-4">
                    <div className="flex justify-center lg:justify-start px-2">
                        <ThemeToggle />
                    </div>

                    {user ? (
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                                className="group relative flex items-center gap-4 p-2.5 pl-3 rounded-xl bg-ink-900 dark:bg-white/5 border border-transparent dark:border-white/10 text-white dark:text-ink-300 hover:bg-ink-800 dark:hover:bg-white/10 dark:hover:text-white transition-all justify-start w-full overflow-hidden"
                            >
                                <div className="shrink-0 flex items-center justify-center">
                                    <LogIn size={20} className="transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex flex-col items-start md:hidden lg:flex overflow-hidden flex-1 min-w-0">
                                    <span className="text-sm font-medium text-left">Sign out</span>
                                    <span className="text-[10px] opacity-70 truncate w-full text-left">
                                        {user?.name ?? user?.email ?? 'Signed in'}
                                    </span>
                                </div>
                                {user?.image && (
                                    <div className="shrink-0 h-10 w-10 rounded-full overflow-hidden border-2 border-ink-950 dark:border-ink-900 shadow-xl transition-transform group-hover:scale-105">
                                        <img
                                            src={user.image}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/auth/signin"
                            className="flex items-center gap-3 p-3 rounded-xl bg-ink-900 dark:bg-white/5 border border-transparent dark:border-white/10 text-white dark:text-ink-300 hover:bg-ink-800 dark:hover:bg-white/10 dark:hover:text-white transition-all justify-center lg:justify-start mx-auto lg:mx-0 w-full"
                            onClick={() => setIsMobileOpen(false)}
                        >
                            <LogIn size={18} />
                            <div className="flex flex-col items-start md:hidden lg:flex overflow-hidden">
                                <span className="text-sm font-medium">Sign in</span>
                                <span className="text-[10px] opacity-70 truncate w-full max-w-[150px]">
                                    Access your apps
                                </span>
                            </div>
                        </Link>
                    )}
                </div>
            </aside>
        </>
    );
}
