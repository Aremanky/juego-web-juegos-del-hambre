import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Character, PhotoDTO, RoomPreviewDTO, ServerInfoDTO, TemplateDTO, UserDTO } from '@ceniza/shared';
import { api, ApiFailure } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiFailure && e.status < 500) && n < 2, refetchOnWindowFocus: false },
  },
});

export const keys = {
  me: ['me'] as const,
  info: ['server-info'] as const,
  photos: ['photos'] as const,
  templates: ['templates'] as const,
  myRooms: ['rooms', 'mine'] as const,
  room: (code: string) => ['rooms', code] as const,
};

export function useServerInfo() {
  return useQuery({ queryKey: keys.info, queryFn: () => api.get<ServerInfoDTO>('/api/server-info'), staleTime: Infinity });
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: UserDTO }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function usePhotos(enabled = true) {
  return useQuery({ queryKey: keys.photos, queryFn: async () => (await api.get<{ photos: PhotoDTO[] }>('/api/photos')).photos, enabled });
}

export function useTemplates(enabled = true) {
  return useQuery({ queryKey: keys.templates, queryFn: async () => (await api.get<{ templates: TemplateDTO[] }>('/api/characters')).templates, enabled });
}

export interface MyRoom {
  id: string;
  code: string;
  name: string;
  status: string;
  isHost: boolean;
  humans: number;
  bots: number;
  maxParticipants: number;
  updatedAt: string;
}
export function useMyRooms() {
  return useQuery({ queryKey: keys.myRooms, queryFn: async () => (await api.get<{ rooms: MyRoom[] }>('/api/rooms/mine')).rooms, staleTime: 5_000 });
}

export function useRoomPreview(code: string | null) {
  return useQuery({
    queryKey: keys.room(code ?? ''),
    queryFn: async () => (await api.get<{ room: RoomPreviewDTO }>(`/api/rooms/${code}`)).room,
    enabled: !!code && code.length === 6,
    retry: false,
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Character }) =>
      id ? (await api.put<{ template: TemplateDTO }>(`/api/characters/${id}`, { data })).template : (await api.post<{ template: TemplateDTO }>('/api/characters', { data })).template,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates }),
  });
}
