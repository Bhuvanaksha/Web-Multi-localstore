import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import { type AppNotification, prependNotification } from '../hooks/useNotifications';
import { useAuthStore } from '../stores/useAuthStore';

const WS_URL = import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:5347';

export const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !accessToken) {
      socket?.disconnect();
      setSocket(null);
      return;
    }

    const s = io(WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    // Real-time notifications
    s.on('notification:push', (notification: AppNotification) => {
      prependNotification(queryClient, notification);
    });

    setSocket(s);
    return () => {
      s.off('notification:push');
      s.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken, queryClient]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** Subscribes to a socket event while mounted; auto-unsubscribes on unmount. */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const socket = useContext(SocketContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const cb = (data: T) => handlerRef.current(data);
    socket.on(event, cb);
    return () => {
      socket.off(event, cb);
    };
  }, [socket, event]);
}
