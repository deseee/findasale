import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Staff member with workspace and availability data
 */
export interface StaffMember {
  id: string;
  workspaceMemberId: string;
  role: string; // "ADMIN", "MANAGER", "MEMBER", "VIEWER" (legacy data may contain "STAFF")
  department?: string;
  primaryPhone?: string;
  createdAt: string;
  updatedAt: string;
  workspaceMember?: {
    id: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    organizer?: {
      id: string;
      businessName: string;
      profilePhoto?: string;
      user?: { email?: string };
    };
  };
  availability?: StaffAvailability;
  performances?: StaffPerformance[];
}

/**
 * Staff availability schedule
 */
export interface StaffAvailability {
  id: string;
  staffMemberId: string;
  monStartTime?: string;
  monEndTime?: string;
  tueStartTime?: string;
  tueEndTime?: string;
  wedStartTime?: string;
  wedEndTime?: string;
  thuStartTime?: string;
  thuEndTime?: string;
  friStartTime?: string;
  friEndTime?: string;
  satStartTime?: string;
  satEndTime?: string;
  sunStartTime?: string;
  sunEndTime?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Staff performance metrics
 */
export interface StaffPerformance {
  id: string;
  staffMemberId: string;
  period: 'WEEKLY' | 'MONTHLY';
  itemsSold: number;
  revenue: number; // Decimal stored as number
  avgItemPrice: number; // Decimal stored as number
  tasksCompleted: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Coverage gap alert
 */
export interface CoverageGap {
  id: string;
  saleId: string;
  saleName: string;
  saleDate: string;
  requiredRole: string;
  currentAssignments: number;
  message: string;
}

/**
 * Get all staff members for a workspace
 */
export const useStaffList = (workspaceId?: string) => {
  return useQuery<StaffMember[]>({
    queryKey: ['staff-list', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await api.get(`/workspaces/${workspaceId}/staff`);
      return response.data;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Get a single staff member's details
 */
export const useStaffMember = (workspaceId?: string, staffId?: string) => {
  return useQuery<StaffMember>({
    queryKey: ['staff-member', workspaceId, staffId],
    queryFn: async () => {
      if (!workspaceId || !staffId) throw new Error('Missing workspaceId or staffId');
      const response = await api.get(`/workspaces/${workspaceId}/staff/${staffId}`);
      return response.data;
    },
    enabled: !!workspaceId && !!staffId,
  });
};

/**
 * Update staff profile (role, department, primaryPhone)
 */
export const useUpdateStaffProfile = (workspaceId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, role, department, primaryPhone }: {
      staffId: string;
      role?: string;
      department?: string;
      primaryPhone?: string;
    }) => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      const response = await api.patch(
        `/workspaces/${workspaceId}/staff/${staffId}`,
        { role, department, primaryPhone }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['staff-member'] });
    },
  });
};

/**
 * Update staff availability schedule
 */
export const useUpdateAvailability = (workspaceId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, availability }: {
      staffId: string;
      availability: Partial<StaffAvailability>;
    }) => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      const response = await api.patch(
        `/workspaces/${workspaceId}/staff/${staffId}/availability`,
        availability
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['staff-member'] });
    },
  });
};

/**
 * Get coverage gap alerts for upcoming sales
 */
export const useCoverageGaps = (workspaceId?: string) => {
  return useQuery<CoverageGap[]>({
    queryKey: ['coverage-gaps', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await api.get(`/workspaces/${workspaceId}/coverage-gaps`);
      return response.data;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Get performance snapshot for a staff member
 */
export const useStaffPerformance = (workspaceId?: string, staffId?: string) => {
  return useQuery<StaffPerformance>({
    queryKey: ['staff-performance', workspaceId, staffId],
    queryFn: async () => {
      if (!workspaceId || !staffId) throw new Error('Missing workspaceId or staffId');
      const response = await api.get(
        `/workspaces/${workspaceId}/staff/${staffId}/performance`
      );
      return response.data;
    },
    enabled: !!workspaceId && !!staffId,
  });
};

/**
 * Remove a staff member from workspace
 */
export const useRemoveStaffMember = (workspaceId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staffId: string) => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      const response = await api.delete(`/workspaces/${workspaceId}/staff/${staffId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list', workspaceId] });
    },
  });
};
