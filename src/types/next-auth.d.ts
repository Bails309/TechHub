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
