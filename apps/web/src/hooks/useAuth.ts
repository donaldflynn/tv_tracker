import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AuthMe } from '@showtracker/types';

export function useAuth() {
  return useQuery<AuthMe, Error>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthMe>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
