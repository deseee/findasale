import React, { createContext, useContext, useState, useEffect } from 'react';
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
  referralCode?: string;
  categoryInterests?: string[];
  streakPoints?: number;
  huntPassActive?: boolean;
  organizerTier?: string;
  subscriptionStatus?: string | null;
  notificationPrefs?: Record<string, boolean>;
  onboardingComplete?: boolean;
  createdAt?: string;
  verificationStatus?: string;
}

interface AuthContextType {
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          referralCode: payload.referralCode || '',
          organizerTier: payload.subscriptionTier || 'SIMPLE',
          subscriptionStatus: payload.subscriptionStatus ?? null,
          onboardingComplete: payload.onboardingComplete ?? false,
          createdAt: payload.createdAt
        });
      } catch (e) {
        console.error('Failed to decode token', e);
        localStorage.removeItem('token');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (token: string) => {
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
        referralCode: payload.referralCode || '',
        organizerTier: payload.subscriptionTier || 'SIMPLE',
        subscriptionStatus: payload.subscriptionStatus ?? null,
        onboardingComplete: payload.onboardingComplete ?? false,
        createdAt: payload.createdAt
      });
    } catch (e) {
      console.error('Failed to decode token', e);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.Authorization;
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
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
