'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShieldCheck, LogIn, Menu, X, LayoutDashboard, Settings } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './ThemeProvider';

export default function SideNav() {
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
                className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-ink-900/80 backdrop-blur-md border border-ink-800 text-ink-50 shadow-lg"
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                aria-label="Toggle menu"
            >
                {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Side Navigation Rail */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-64 md:w-20 lg:w-64 glass flex flex-col justify-between transition-transform duration-300 ease-in-out border-r border-ink-200/50 dark:border-white/5 
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
            >
                <div className="flex flex-col flex-1 py-8 px-4 overflow-y-auto">
                    {/* Logo Section */}
                    <Link
                        href="/"
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 mb-12 mx-auto lg:mx-0 ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        <div className="h-12 w-auto shrink-0">
                            <img
                                src={theme === 'dark' ? '/capita-logo-dark.png' : '/capita-logo.png'}
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
                            className={`flex items-center gap-4 px-4 pl-3 py-3 rounded-xl transition-all group ${!isAdminPanel ? 'bg-ocean-50 dark:bg-ocean-500/10 text-ocean-600 dark:text-ocean-400 font-medium' : 'text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-800/50'} ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <LayoutDashboard size={20} className={!isAdminPanel ? 'text-ocean-500' : 'text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300'} />
                            <span className="md:hidden lg:inline whitespace-nowrap">Dashboard</span>
                        </Link>

                        {roles.includes('admin') && (
                            <Link
                                href="/admin"
                                onClick={() => setIsMobileOpen(false)}
                                className={`flex items-center gap-4 px-4 pl-3 py-3 rounded-xl transition-all group ${isAdminPanel ? 'bg-ocean-50 dark:bg-ocean-500/10 text-ocean-600 dark:text-ocean-400 font-medium' : 'text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-800/50'} ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <Settings size={20} className={isAdminPanel ? 'text-ocean-500' : 'text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300'} />
                                <span className="md:hidden lg:inline whitespace-nowrap">Administration</span>
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
                            {isLocalUser && (
                                <Link
                                    href="/auth/change-password"
                                    className="w-full text-center text-xs py-2 rounded-lg bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700 transition"
                                    onClick={() => setIsMobileOpen(false)}
                                >
                                    <span className="md:hidden lg:inline">Change Password</span>
                                    <span className="hidden md:inline lg:hidden">Pwd</span>
                                </Link>
                            )}
                            <button
                                type="button"
                                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                                className="flex items-center gap-3 p-3 rounded-xl bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 hover:bg-ink-800 dark:hover:bg-white transition-colors justify-center lg:justify-start mx-auto lg:mx-0 w-full"
                            >
                                <LogIn size={18} className="shrink-0" />
                                <div className="flex flex-col items-start md:hidden lg:flex overflow-hidden">
                                    <span className="text-sm font-medium">Sign out</span>
                                    <span className="text-[10px] opacity-70 truncate w-full max-w-[150px]">
                                        {user.name ?? user.email ?? 'Signed in'}
                                    </span>
                                </div>
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/auth/signin"
                            className="flex items-center gap-3 p-3 rounded-xl bg-ocean-600 text-white hover:bg-ocean-700 transition-colors justify-center lg:justify-start mx-auto lg:mx-0 w-full"
                        >
                            <LogIn size={18} />
                            <span className="md:hidden lg:inline font-medium">Sign in</span>
                        </Link>
                    )}
                </div>
            </aside>
        </>
    );
}
