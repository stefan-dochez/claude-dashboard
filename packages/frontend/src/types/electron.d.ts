export interface UpdateProgress { received: number; total: number }
export interface UpdateStatus { phase: 'downloading' | 'preparing' | 'installing' | 'error'; message?: string }

export interface ElectronAPI {
  isElectron: true;
  update: {
    install: (assetUrl: string, assetName: string) => Promise<void>;
    onProgress: (cb: (p: UpdateProgress) => void) => () => void;
    onStatus: (cb: (s: UpdateStatus) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
