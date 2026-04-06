import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io('/', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketInstance.on('connect', () => {
      console.log('[socket] Connected');
    });
    socketInstance.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
    });
  }
  return socketInstance;
}

export function useSocket(): Socket {
  const socketRef = useRef(getSocket());
  return socketRef.current;
}

export function useSocketEvent<T>(event: string, handler: (data: T) => void): void {
  const socket = useSocket();

  useEffect(() => {
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
}
