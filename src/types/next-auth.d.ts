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
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    roles?: string[];
    mustChangePassword?: boolean;
    authProvider?: string;
    securityStamp?: Date;
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
    securityStamp?: number;
  }
}
