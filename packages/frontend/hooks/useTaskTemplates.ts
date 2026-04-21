import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface TaskTemplate {
  title: string;
  description?: string;
  phase?: 'pre' | 'during' | 'post';
}

export interface TaskTemplateCategory {
  id: string;
  label: string;
  emoji: string;
  tasks: TaskTemplate[];
}

export function useTaskTemplates(workspaceId: string) {
  return useQuery({
    queryKey: ['taskTemplates', workspaceId],
    queryFn: async () => {
      const response = await api.get(`/workspace/${workspaceId}/tasks/templates`);
      return response.data as { templates: TaskTemplateCategory[] };
    },
    staleTime: 1000 * 60 * 10, // templates rarely change
  });
}
