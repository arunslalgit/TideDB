import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { BackendType } from '../../components/ConnectionManager';

interface PlaygroundState {
  active: boolean;
  backendType: BackendType;
  setBackendType: (t: BackendType) => void;
}

const PlaygroundContext = createContext<PlaygroundState>({
  active: false,
  backendType: 'influxdb',
  setBackendType: () => {},
});

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [backendType, setBackendTypeState] = useState<BackendType>('influxdb');

  const setBackendType = useCallback((t: BackendType) => {
    setBackendTypeState(t);
  }, []);

  return (
    <PlaygroundContext.Provider value={{ active: true, backendType, setBackendType }}>
      {children}
    </PlaygroundContext.Provider>
  );
}

export function usePlayground(): PlaygroundState {
  return useContext(PlaygroundContext);
}

export default PlaygroundContext;
