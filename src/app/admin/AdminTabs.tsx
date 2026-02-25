'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, AppWindow, Users, KeyRound, ScrollText, Settings } from 'lucide-react';

const tabs = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/apps', label: 'Apps', icon: AppWindow },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/sso', label: 'SSO', icon: KeyRound },
  { href: '/admin/audit', label: 'Audit', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-6 md:px-12 pt-4 pb-2">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition
              ${isActive ? 'tab-active' : 'tab-inactive'}
            `}
          >
            <Icon size={16} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
