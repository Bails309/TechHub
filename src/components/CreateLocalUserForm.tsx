'use client';

import { useFormState } from 'react-dom';
import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import type { Role } from '@prisma/client';
import type { CreateLocalUserState } from '@/app/admin/actions';
import { validatePasswordComplexity, type PasswordPolicy } from '@/lib/password';
import HiddenCsrfInput from './HiddenCsrfInput';
import RoleMultiSelect from './RoleMultiSelect';

type CreateLocalUserFormProps = {
  createLocalUser: (
    prevState: CreateLocalUserState,
    formData: FormData
  ) => Promise<CreateLocalUserState>;
  roles: Role[];
  passwordPolicy: PasswordPolicy;
};

const initialState: CreateLocalUserState = { status: 'idle', message: '' };

export default function CreateLocalUserForm({ createLocalUser, roles, passwordPolicy }: CreateLocalUserFormProps) {
  const [state, formAction] = useFormState(createLocalUser, initialState);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const generatePassword = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = uppercase + lowercase + numbers + symbols;

    let attempts = 0;
    let newPass = '';

    // Safety break at 100 attempts, though usually takes 1 or 2
    while (attempts < 100) {
      newPass = '';
      const length = Math.max(passwordPolicy.minLength, 16);

      for (let i = 0; i < length; i++) {
        newPass += all.charAt(Math.floor(Math.random() * all.length));
      }

      if (!validatePasswordComplexity(newPass, passwordPolicy)) {
        break;
      }
      attempts++;
    }

    setPassword(newPass);
    setCopied(false);
  };

  const copyToClipboard = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <HiddenCsrfInput />
      <input
        name="name"
        placeholder="Full name"
        className="input-field"
      />
      <input
        name="email"
        placeholder="Email"
        type="email"
        required
        className="input-field"
      />
      <div className="relative flex items-center md:col-span-2 gap-2">
        <input
          name="password"
          placeholder="Temporary password"
          type="text"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={generatePassword}
          className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-ink-300"
          title="Generate random password"
        >
          <RefreshCw size={18} className={password ? '' : 'animate-spin-once'} />
        </button>
        <button
          type="button"
          onClick={copyToClipboard}
          disabled={!password}
          className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-ink-300 disabled:opacity-30"
          title="Copy to clipboard"
        >
          <Copy size={18} className={copied ? 'text-emerald-400' : ''} />
        </button>
      </div>

      <div className="md:col-span-2">
        <RoleMultiSelect
          options={roles.map(r => ({ value: r.id, label: r.name }))}
          initialSelected={[]}
        />
      </div>

      <button
        type="submit"
        className="btn-primary btn-small md:col-span-2"
      >
        Create local user
      </button>
      {state.status !== 'idle' ? (
        <p className={state.status === 'success' ? 'text-emerald-600 dark:text-emerald-300 text-xs md:col-span-2 font-medium' : 'text-rose-600 dark:text-rose-300 text-xs md:col-span-2 font-medium'}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
