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
        onboardingComplete: payload.onboardingComplete ?? false,
        teamsOnboardingComplete: payload.teamsOnboardingComplete ?? false,
        createdAt: payload.createdAt,
        emailVerified: payload.emailVerified ?? true, // S512: default true for old tokens
      });
    } catch (e) {
      console.error('Failed to decode token', e);
    }
  }, []);

  const logout = useCallback(() => {
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
