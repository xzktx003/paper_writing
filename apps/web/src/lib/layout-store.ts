export type LayoutMode = "expanded" | "compact" | "immersive";

export interface LayoutState {
  sidebarCollapsed: boolean;
  topbarCollapsed: boolean;
}

const STORAGE_KEY = "agent-console-layout";

const DEFAULT_STATE: LayoutState = {
  sidebarCollapsed: false,
  topbarCollapsed: false,
};

export function loadLayoutState(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      topbarCollapsed: Boolean(parsed.topbarCollapsed),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveLayoutState(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function deriveLayoutMode(state: LayoutState): LayoutMode {
  if (state.sidebarCollapsed && state.topbarCollapsed) return "immersive";
  if (state.sidebarCollapsed) return "compact";
  return "expanded";
}
