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
    const initAuth = async () => {
      try {
        // P0 Security Fix: Try to restore session from httpOnly cookie first
        const meResponse = await api.get('/auth/me');
        if (meResponse.data?.user) {
          // Session restored from cookie successfully
          const user = meResponse.data.user;
          // Decode the JWT from any token returned to get full user data with roles
          // If no token in response, we already have user from /auth/me
          const token = localStorage.getItem('token');
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              api.defaults.headers.Authorization = `Bearer ${token}`;
            } catch (e) {
              // Failed to decode stored token, but /auth/me succeeded — use cookie session
            }
          }

          // Use user data from /auth/me response, falling back to decode from localStorage token if available
          const decodedToken = token ? JSON.parse(atob(token.split('.')[1])) : null;
          setUser({
            id: user.id || decodedToken?.id,
            email: user.email || decodedToken?.email,
            name: user.name || decodedToken?.name,
            firstName: user.firstName || decodedToken?.firstName || '',
            businessName: user.businessName || decodedToken?.businessName || '',
            role: user.role || decodedToken?.role,
            roles: user.roles || decodedToken?.roles || [user.role || decodedToken?.role],
            points: user.points || decodedToken?.points || 0,
            guildXp: user.guildXp || decodedToken?.guildXp || 0,
            referralCode: user.referralCode || decodedToken?.referralCode || '',
            huntPassActive: user.huntPassActive || decodedToken?.huntPassActive,
            huntPassExpiry: user.huntPassExpiry || decodedToken?.huntPassExpiry,
            organizerTier: user.organizerTier || decodedToken?.subscriptionTier || 'SIMPLE',
            subscriptionStatus: user.subscriptionStatus !== undefined ? user.subscriptionStatus : decodedToken?.subscriptionStatus ?? null,
            subscriptionLapsed: user.subscriptionLapsed !== undefined ? user.subscriptionLapsed : decodedToken?.subscriptionLapsed ?? false,
            onboardingComplete: user.onboardingComplete !== undefined ? user.onboardingComplete : decodedToken?.onboardingComplete ?? false,
            teamsOnboardingComplete: user.teamsOnboardingComplete !== undefined ? user.teamsOnboardingComplete : decodedToken?.teamsOnboardingComplete ?? false,
            createdAt: user.createdAt || decodedToken?.createdAt,
            emailVerified: user.emailVerified !== undefined ? user.emailVerified : decodedToken?.emailVerified ?? true,
          });
          setIsLoading(false);
          return;
        }
      } catch (err) {
        // Cookie session failed or not available — fall through to localStorage
      }

      // Fallback: check localStorage for token (backward compatibility during grace period)
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          // E7: Detect expired token before making any API calls — clears stale auth state cleanly
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('token');
            setIsLoading(false);
            return;
          }
          api.defaults.headers.Authorization = `Bearer ${token}`;
          setUser({
            id: payload.id,
            email: payload.email,
            name: payload.name,
            firstName: payload.firstName || '',
            businessName: payload.businessName || '',
            role: payload.role,
            roles: payload.roles || [payload.role], // Feature #72 Phase 2: Fallback to single-role array
            points: payload.points || 0,
            guildXp: payload.guildXp || 0, // Phase 2a: Explorer's Guild XP
            // explorerRank removed: fetch fresh from /api/xp/profile instead
            referralCode: payload.referralCode || '',
            huntPassActive: payload.huntPassActive,
            huntPassExpiry: payload.huntPassExpiry,
            organizerTier: payload.subscriptionTier || 'SIMPLE',
            subscriptionStatus: payload.subscriptionStatus ?? null,
            subscriptionLapsed: payload.subscriptionLapsed ?? false, // Feature #75: Tier lapse state
            onboardingComplete: payload.onboardingComplete ?? false,
            teamsOnboardingComplete: payload.teamsOnboardingComplete ?? false,
            createdAt: payload.createdAt,
            emailVerified: payload.emailVerified ?? true, // S512: default true for old tokens
          });
        } catch (e) {
          console.error('Failed to decode token', e);
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback((token: string) => {
    localStorage.setItem('token', token);
    api.defaults.headers.Authorization = `Bearer ${token}`;
    // Decode token to get user info
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({
        id: payload.id,
        email: payload.email,
        name: payload.name,
        firstName: payload.firstName || '',
        businessName: payload.businessName || '',
        role: payload.role,
        roles: payload.roles || [payload.role], // Feature #72 Phase 2: Fallback to single-role array
        points: payload.points || 0,
        guildXp: payload.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead
        referralCode: payload.referralCode || '',
        huntPassActive: payload.huntPassActive,
        huntPassExpiry: payload.huntPassExpiry,
        organizerTier: payload.subscriptionTier || 'SIMPLE',
        subscriptionStatus: payload.subscriptionStatus ?? null,
        subscriptionLapsed: payload.subscriptionLapsed ?? false, // Feature #75: Tier lapse state
        onboardingComplete: payload.onboardingComplete ?? false,
        teamsOnboardingComplete: payload.teamsOnboardingComplete ?? false,
        createdAt: payload.createdAt,
        emailVerified: payload.emailVerified ?? true, // S512: default true for old tokens
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

    localStorage.removeItem('token');
    localStorage.removeItem('fas_shopper_cart');
    delete api.defaults.headers.Authorization;
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
