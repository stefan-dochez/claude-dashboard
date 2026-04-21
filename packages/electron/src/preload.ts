import { contextBridge, ipcRenderer } from 'electron';

export interface UpdateProgress {
  received: number;
  total: number;
}

export interface UpdateStatus {
  phase: 'downloading' | 'preparing' | 'installing' | 'error';
  message?: string;
}

type Unsubscribe = () => void;

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  update: {
    install: (assetUrl: string, assetName: string): Promise<void> =>
      ipcRenderer.invoke('update:install', { assetUrl, assetName }),
    onProgress: (cb: (p: UpdateProgress) => void): Unsubscribe =>
      on<UpdateProgress>('update:progress', cb),
    onStatus: (cb: (s: UpdateStatus) => void): Unsubscribe =>
      on<UpdateStatus>('update:status', cb),
  },
});
