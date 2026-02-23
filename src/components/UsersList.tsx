'use client';

import { useMemo, useState } from 'react';

export type UserListItem = {
  id: string;
  name: string | null;
  email: string | null;
  roles: string[];
  providers: string[];
  isLocal: boolean;
};

type FilterKey = 'all' | 'local' | 'sso' | 'hybrid';

type ProviderFilter = 'any' | 'azure-ad' | 'keycloak' | 'credentials';

export default function UsersList({ users }: { users: UserListItem[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('any');

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const isHybrid = user.isLocal && user.providers.length > 0;
      const isSsoOnly = !user.isLocal && user.providers.length > 0;

      if (filter === 'local' && (!user.isLocal || isHybrid)) {
        return false;
      }
      if (filter === 'sso' && !isSsoOnly) {
        return false;
      }
      if (filter === 'hybrid' && !isHybrid) {
        return false;
      }

      if (providerFilter !== 'any') {
        return user.providers.includes(providerFilter);
      }

      return true;
    });
  }, [users, filter, providerFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all', label: 'All' },
            { key: 'local', label: 'Local' },
            { key: 'sso', label: 'SSO only' },
            { key: 'hybrid', label: 'Local + SSO' }
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${
                filter === item.key
                  ? 'bg-ocean-500 text-white border-ocean-500'
                  : 'border-ink-700 text-ink-200 hover:border-ink-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-300">
          <span>Provider:</span>
          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value as ProviderFilter)}
            className="input-surface rounded-full px-3 py-1 text-xs text-ink-100"
          >
            <option value="any">Any</option>
            <option value="azure-ad">Azure AD</option>
            <option value="keycloak">Keycloak</option>
            <option value="credentials">Credentials</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((user) => {
          const sourceLabel = user.isLocal
            ? user.providers.length
              ? `Local + ${user.providers.join(', ')}`
              : 'Local'
            : user.providers.length
              ? user.providers.join(', ')
              : 'SSO';

          return (
            <div key={user.id} className="rounded-2xl border border-ink-800 px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{user.name ?? user.email ?? 'Unnamed user'}</p>
                  <p className="text-xs text-ink-400">{user.email ?? 'No email'}</p>
                  <p className="text-xs text-ink-300">
                    Roles: {user.roles.length ? user.roles.join(', ') : 'None'}
                  </p>
                </div>
                <span className="rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-200">
                  {sourceLabel}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-xs text-ink-300">No users match the selected filters.</p>
        ) : null}
      </div>
    </div>
  );
}
