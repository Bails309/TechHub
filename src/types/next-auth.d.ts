import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    idleTimeoutMs?: number;
    warningMs?: number;
    revoked?: boolean;
    interacted?: boolean;
    logoutReason?: string;
    user: {
      id: string;
      roles: string[];
      authProvider?: string;
      mustChangePassword?: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    roles?: string[];
    authProvider?: string;
    mustChangePassword?: boolean;
    logoutReason?: string;
    revoked?: boolean;
    lastActivity?: number;
    lastCheckedAt?: number;
    userUpdatedAt?: number;
  }
}
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      roles: string[];
      mustChangePassword?: boolean;
      authProvider?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    roles?: string[];
    mustChangePassword?: boolean;
    authProvider?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    authProvider?: string;
    mustChangePassword?: boolean;
    roles?: string[];
    id?: string;
  }
}
