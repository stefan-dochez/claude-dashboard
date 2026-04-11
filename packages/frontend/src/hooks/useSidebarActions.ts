import { useContext } from 'react';
import { SidebarActionsContext } from '../components/SidebarContext';
import type { SidebarActions } from '../components/SidebarContext';

export function useSidebarActions(): SidebarActions {
  const ctx = useContext(SidebarActionsContext);
  if (!ctx) throw new Error('useSidebarActions must be used within SidebarActionsProvider');
  return ctx;
}
