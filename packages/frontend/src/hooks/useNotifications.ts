import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  resourceId?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unread: number;
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsResponse>('/notifications').then((r) => r.data),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Prepends a realtime notification to the ['notifications'] cache entry. */
export function prependNotification(
  queryClient: ReturnType<typeof useQueryClient>,
  notification: AppNotification,
) {
  queryClient.setQueryData<NotificationsResponse>(['notifications'], (old) => {
    if (!old) return { items: [notification], unread: 1 };
    return { items: [notification, ...old.items], unread: old.unread + 1 };
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<NotificationsResponse>(['notifications'], (old) => {
        if (!old) return old;
        return {
          ...old,
          unread: Math.max(0, old.unread - 1),
          items: old.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        };
      });
    },
  });
}
