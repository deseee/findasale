import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Shopper Crews data layer. All calls go through the shared axios instance (httpOnly cookie
 * auth, CSRF header, refresh-on-401). Mutations invalidate every ['crews', ...] query so the
 * hub, the crew page and the member lists never disagree.
 */

/**
 * Public-safe member identity. `name` is "First L.". `id` is the real user id ONLY when
 * profilePublic is true (the member's collector profile is public); otherwise it is an opaque id
 * that no profile page resolves, so link to /shopper/profile/[id] only when profilePublic.
 */
export interface CrewUserPublic {
  id: string;
  name: string;
  profileSlug?: string | null;
  profilePublic?: boolean;
  guildXp: number;
  explorerRank: string;
}

export interface CrewSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  isFull: boolean;
  isMember?: boolean;
  founder?: { id: string; name: string; profilePublic?: boolean };
}

export interface MyCrew extends CrewSummary {
  role: 'FOUNDER' | 'MEMBER' | string;
  joinedAt: string;
}

export interface CrewLimits {
  maxCrewsPerUser: number;
  maxMembers: number;
  creationCost: number;
}

export interface MyCrewsResponse {
  crews: MyCrew[];
  limits: CrewLimits;
  xp: { guildXp: number; spendable: number };
}

export interface BrowseCrewsResponse {
  crews: CrewSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  maxMembers: number;
}

export interface CrewMemberRow {
  userId: string;
  /** Opaque member id: what the founder tools (transfer, remove) send back to the server. */
  memberRef?: string;
  /** True for the signed-in viewer's own row. */
  isSelf?: boolean;
  role: 'FOUNDER' | 'MEMBER' | string;
  joinedAt: string;
  user: CrewUserPublic;
}

export interface CrewDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
  founder: CrewUserPublic | null;
  /** The signed-in viewer's own standing in this crew (computed server-side). */
  viewer?: { isMember: boolean; role: string | null };
  members: CrewMemberRow[];
}

export interface CrewLeaderboardRow {
  rank: number;
  userId: string;
  memberRef?: string;
  isSelf?: boolean;
  role: string;
  joinedAt: string;
  user: CrewUserPublic;
}

export interface CrewFeedPhoto {
  id: number;
  photoUrl: string;
  caption: string | null;
  likes: number;
  createdAt: string;
  user: { id: string; name: string; profileSlug?: string | null; profilePublic?: boolean; explorerRank: string };
}

/** Pull the server's human-readable message out of an axios error. */
export function crewErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as any;
  const msg = e?.response?.data?.message;
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback;
}

export function crewErrorCode(err: unknown): string | undefined {
  const code = (err as any)?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

export const useMyCrews = (enabled: boolean) =>
  useQuery<MyCrewsResponse, Error>({
    queryKey: ['crews', 'mine'],
    queryFn: async () => (await api.get<MyCrewsResponse>('/crews/mine')).data,
    enabled,
    staleTime: 30 * 1000,
  });

export const useBrowseCrews = (page: number, search: string) =>
  useQuery<BrowseCrewsResponse, Error>({
    queryKey: ['crews', 'browse', page, search],
    queryFn: async () =>
      (await api.get<BrowseCrewsResponse>('/crews', { params: { page, limit: 12, search: search || undefined } })).data,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

export const useCrewDetail = (crewId: string | undefined) =>
  useQuery<CrewDetail, Error>({
    queryKey: ['crews', 'detail', crewId],
    queryFn: async () => (await api.get<CrewDetail>(`/crews/${crewId}`)).data,
    enabled: !!crewId,
    retry: false,
  });

export const useCrewLeaderboard = (crewId: string | undefined) =>
  useQuery<CrewLeaderboardRow[], Error>({
    queryKey: ['crews', 'leaderboard', crewId],
    queryFn: async () => (await api.get<{ members: CrewLeaderboardRow[] }>(`/crews/${crewId}/leaderboard`)).data.members,
    enabled: !!crewId,
  });

export const useCrewFeed = (crewId: string | undefined) =>
  useQuery<CrewFeedPhoto[], Error>({
    queryKey: ['crews', 'feed', crewId],
    queryFn: async () => (await api.get<{ photos: CrewFeedPhoto[] }>(`/crews/${crewId}/feed`)).data.photos,
    enabled: !!crewId,
  });

function useInvalidateCrews() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['crews'] });
}

export interface CreateCrewInput {
  name: string;
  description?: string;
}
export interface CreateCrewResult {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  xpSpent: number;
  remainingXp: number | null;
}

export const useCreateCrew = () => {
  const invalidate = useInvalidateCrews();
  return useMutation<CreateCrewResult, unknown, CreateCrewInput>({
    mutationFn: async (input) => (await api.post<CreateCrewResult>('/crews', input)).data,
    onSuccess: invalidate,
  });
};

export const useJoinCrew = () => {
  const invalidate = useInvalidateCrews();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (crewId) => (await api.post(`/crews/${crewId}/join`)).data,
    onSuccess: invalidate,
  });
};

export const useLeaveCrew = () => {
  const invalidate = useInvalidateCrews();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (crewId) => (await api.post(`/crews/${crewId}/leave`)).data,
    onSuccess: invalidate,
  });
};

export const useRemoveCrewMember = (crewId: string) => {
  const invalidate = useInvalidateCrews();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (userId) => (await api.post(`/crews/${crewId}/members/${userId}/remove`)).data,
    onSuccess: invalidate,
  });
};

export const useTransferCrew = (crewId: string) => {
  const invalidate = useInvalidateCrews();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (userId) => (await api.post(`/crews/${crewId}/transfer`, { userId })).data,
    onSuccess: invalidate,
  });
};

export const useDisbandCrew = (crewId: string) => {
  const invalidate = useInvalidateCrews();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (confirmName) => (await api.post(`/crews/${crewId}/disband`, { confirmName })).data,
    onSuccess: invalidate,
  });
};
