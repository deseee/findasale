import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  organizerId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  invitedAt: string;
  acceptedAt: string | null;
  organizer: {
    id: string;
    businessName: string;
    profilePhoto?: string;
    user?: { email?: string };
  };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerUserId?: string | null;  // User ID of the workspace owner (added for frontend ownership check)
  createdAt: string;
  members?: WorkspaceMember[];
}

export interface WorkspaceWithMembers {
  workspace: Workspace;
  members: WorkspaceMember[];
}

/**
 * Fetch my workspace (owned or member of)
 */
export const useMyWorkspace = () => {
  return useQuery<Workspace | null>({
    queryKey: ['workspace', 'me'],
    queryFn: async () => {
      try {
        const response = await api.get('/workspace');
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
};

/**
 * Fetch workspace members
 */
export const useWorkspaceMembers = () => {
  return useQuery<WorkspaceWithMembers | null>({
    queryKey: ['workspace', 'members'],
    queryFn: async () => {
      try {
        const response = await api.get('/workspace/members');
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
};

/**
 * Create a workspace for TEAMS organizers
 */
export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/workspace', { name });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
};

/**
 * Invite a member to the workspace
 */
export const useInviteMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER' }) => {
      const response = await api.post('/workspace/invite', { email, role });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', 'members'] });
    },
  });
};

/**
 * Accept a workspace invitation
 */
export const useAcceptWorkspaceInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/workspace/accept');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
};

/**
 * Remove a member from the workspace
 */
export const useRemoveWorkspaceMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizerId: string) => {
      const response = await api.delete(`/workspace/members/${organizerId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', 'members'] });
    },
  });
};

/**
 * Fetch pending workspace invitations for current user
 */
export interface PendingInvitation {
  id: string;
  workspaceId: string;
  organizerId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  invitedAt: string;
  acceptedAt: string | null;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
}

export const usePendingWorkspaceInvitations = () => {
  return useQuery<PendingInvitation[]>({
    queryKey: ['workspace', 'invitations', 'pending'],
    queryFn: async () => {
      try {
        const response = await api.get('/workspace/invitations/pending');
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return [];
        }
        throw error;
      }
    },
  });
};

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
}

/**
 * Fetch team workspaces this user is a member of (but doesn't own)
 */
export const useMyWorkspaceMemberships = () => {
  return useQuery<WorkspaceMembership[]>({
    queryKey: ['workspace', 'my-memberships'],
    queryFn: async () => {
      try {
        const response = await api.get('/workspace/my-memberships');
        return response.data.memberships || [];
      } catch (error: any) {
        if (error.response?.status === 404) {
          return [];
        }
        throw error;
      }
    },
  });
};
