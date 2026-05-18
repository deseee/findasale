import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  businessName?: string;
  role: string;
  roles?: string[]; // Feature #72 Phase 2: Array of roles
  points: number;
  guildXp?: number; // Phase 2a: Explorer's Guild XP
  // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
  referralCode?: string;
  categoryInterests?: string[];
  streakPoints?: number;
  huntPassActive?: boolean;
  huntPassExpiry?: string;
  organizerTier?: string;
  subscriptionStatus?: string | null;
  subscriptionLapsed?: boolean; // Feature #75: Whether subscription is currently lapsed (past_due)
  notificationPrefs?: Record<string, boolean>;
  onboardingComplete?: boolean;
  teamsOnboardingComplete?: boolean;
  createdAt?: string;
  verificationStatus?: string;
  profileSlug?: string | null;
  purchasesVisible?: boolean;
  emailVerified?: boolean; // S512: email verification gate
}

interface AuthContextType {
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isLoading: boolean;
  onRankUp?: (newRank: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onRankUp, setOnRankUp] = useState<((newRank: string) => void) | undefined>(undefined);

  useEffect(() => {
    const hydrateFromMeResponse = (user: any) => {
      setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName || '',
        businessName: user.businessName || '',
        role: user.role,
        roles: user.roles || [user.role],
        points: user.points || 0,
        guildXp: user.guildXp || 0,
        referralCode: user.referralCode || '',
        huntPassActive: user.huntPassActive,
        huntPassExpiry: user.huntPassExpiry,
        organizerTier: user.organizerTier || 'SIMPLE',
        subscriptionStatus: user.subscriptionStatus ?? null,
        subscriptionLapsed: user.subscriptionLapsed ?? false,
        onboardingComplete: user.onboardingComplete ?? false,
        teamsOnboardingComplete: user.teamsOnboardingComplete ?? false,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified ?? true,
      });
    };

    const initAuth = async () => {
      // P0 Security Fix: Restore session from httpOnly cookie on mount
      try {
        const meResponse = await api.get('/auth/me');
        if (meResponse.data?.user) {
          hydrateFromMeResponse(meResponse.data.user);
          setIsLoading(false);
          return;
        }
      } catch (err: any) {
        if (err.response?.status === 429) {
          // CRIT-1 fix: Rate limiter fired on /auth/me (e.g. after failed login/register attempts
          // from the same IP). A 429 does NOT mean the user is logged out — it means the backend
          // is temporarily throttling. Keep isLoading=false and leave user as null (not logged in
          // from React's perspective), but do NOT redirect or clear cookies. The user can refresh
          // manually or navigate again once the window expires.
          console.warn('[AuthContext] /auth/me rate-limited (429). Treating as temporarily unavailable, not logged-out.');
          setIsLoading(false);
          return;
        }
        if (err.response?.status === 401) {
          // S708 sign-off fix: access token may have expired while refresh token is still valid.
          // Try POST /auth/refresh once — if successful, retry /auth/me. Only treat as logged-out
          // if the refresh itself fails. Without this, any tab idle longer than the access-token
          // TTL appears signed out even though the user has a valid 30-day refresh cookie.
          try {
            await api.post('/auth/refresh');
            const retryMe = await api.get('/auth/me');
            if (retryMe.data?.user) {
              hydrateFromMeResponse(retryMe.data.user);
              setIsLoading(false);
              return;
            }
          } catch {
            // Refresh failed — user is genuinely logged out. Fall through to setIsLoading(false).
          }
          setIsLoading(false);
          return;
        }
        console.error('[AuthContext] Session restore failed:', err?.message);
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback((token: string) => {
    // Note: Token is now stored in httpOnly cookie by backend /login endpoint
    // No longer storing in localStorage for security
    // Decode token to get user info for immediate context update
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({
        id: payload.id,
        email: payload.email,
        name: payload.name,
        firstName: payload.firstName || '',
        businessName: payload.businessName || '',
        role: payload.role,
        roles: payload.roles || [payload.role],
        points: payload.points || 0,
        guildXp: payload.guildXp || 0,
        referralCode: payload.referralCode || '',
        huntPassActive: payload.huntPassActive,
        huntPassExpiry: payload.huntPassExpiry,
        organizerTier: payload.subscriptionTier || 'SIMPLE',
        subscriptionStatus: payload.subscriptionStatus ?? null,
        subscriptionLapsed: payload.subscriptionLapsed ?? false,
        onboardingComplete: payload.onboardingComplete ?? false,
        teamsOnboardingComplete: payload.teamsOnboardingComplete ?? false,
        createdAt: payload.createdAt,
        emailVerified: payload.emailVerified ?? true,
      });
    } catch (e) {
      console.error('Failed to decode token', e);
    }
  }, []);

  const logout = useCallback(async () => {
    // P0 Security Fix: Call logout endpoint to clear httpOnly cookies
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout request failed:', err);
      // Continue with client-side cleanup even if request fails
    }

    localStorage.removeItem('fas_shopper_cart');
    setUser(null);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isLoading, onRankUp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
