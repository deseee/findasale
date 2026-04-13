// Phase 31: Extend NextAuth types to carry our backend JWT through the session
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    backendJwt?: string;
    userRole?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    backendJwt?: string;
    userRole?: string;
  }
}
