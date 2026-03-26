import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  organizerId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
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
    mutationFn: async ({ email, role }: { email: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }) => {
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
