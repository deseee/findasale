/**
 * useWorkspaceSettings.ts — React Query hooks for workspace settings, permissions, and templates
 *
 * Hooks:
 *   useWorkspaceSettings(workspaceId)     — GET workspace settings
 *   useUpdateWorkspaceSettings(workspaceId) — PATCH workspace settings mutation
 *   useApplyTemplate(workspaceId)         — POST apply template mutation
 *   useWorkspacePermissions(workspaceId)  — GET all permissions for workspace
 *   useUpdatePermissions(workspaceId)     — PATCH permissions for a role mutation
 *   useCostCalculator(workspaceId)        — GET cost breakdown and member count
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface WorkspaceSettings {
  id: string;
  workspaceId: string;
  name?: string;
  description?: string;
  brandRules?: string;
  templateUsed?: string;
  maxMembers?: number;
  enableAnalytics: boolean;
  enableLeaderboard: boolean;
  enableTeamChat: boolean;
  commissionOverride?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionCategory {
  category: string;
  permissions: Permission[];
}

export interface Permission {
  action: string;
  allowed: boolean;
}

export interface RolePermissions {
  role: string;
  permissions: PermissionCategory[];
}

export interface WorkspaceTemplate {
  id?: string;
  name: string;
  description?: string;
  recommendedTeamSize?: number;
  permissions?: string[];
}

export interface CostCalculator {
  baseFee: number;
  currentMembers: number;
  maxMembers: number;
  additionalSeats: number;
  additionalSeatsCost: number;
  totalMonthlyCost: number;
}

// ─── GET /api/workspace/:workspaceId/settings ────────────────────────────
export function useWorkspaceSettings(workspaceId: string | null) {
  return useQuery<WorkspaceSettings>({
    queryKey: ['workspaceSettings', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.get(`/workspace/${workspaceId}/settings`);
      return res.data;
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000, // 60 seconds
  });
}

// ─── PATCH /api/workspace/:workspaceId/settings ────────────────────────────
export function useUpdateWorkspaceSettings(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<WorkspaceSettings>) => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.patch(`/workspace/${workspaceId}/settings`, updates);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['workspaceSettings', workspaceId], data);
    },
  });
}

// ─── POST /api/workspace/:workspaceId/apply-template ────────────────────────
export function useApplyTemplate(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateName: string) => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.post(`/workspace/${workspaceId}/apply-template`, {
        template: templateName,
      });
      return res.data;
    },
    onSuccess: () => {
      // Invalidate permissions after template is applied
      queryClient.invalidateQueries({ queryKey: ['workspacePermissions', workspaceId] });
    },
  });
}

// ─── GET /api/workspace/:workspaceId/permissions ────────────────────────────
export function useWorkspacePermissions(workspaceId: string | null) {
  return useQuery<RolePermissions[]>({
    queryKey: ['workspacePermissions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.get(`/workspace/${workspaceId}/permissions`);
      return res.data;
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000, // 60 seconds
  });
}

// ─── PATCH /api/workspace/:workspaceId/permissions/:role ────────────────────
export function useUpdatePermissions(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { role: string; permissions: string[] }) => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.patch(
        `/workspace/${workspaceId}/permissions/${payload.role}`,
        { permissions: payload.permissions }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspacePermissions', workspaceId] });
    },
  });
}

// ─── GET /api/workspace/:workspaceId/cost-calculator ────────────────────────
export function useCostCalculator(workspaceId: string | null) {
  return useQuery<CostCalculator>({
    queryKey: ['costCalculator', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error('workspaceId required');
      const res = await api.get(`/workspace/${workspaceId}/cost-calculator`);
      return res.data;
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000, // 60 seconds
  });
}
