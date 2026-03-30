export type DockResponsiveStrategy = "viewport" | "container";
export type DockResponsiveMode = "desktop" | "compact" | "mobile";

export const DOCK_COMPACT_BREAKPOINT = 1_100;
export const DOCK_VIEWPORT_MOBILE_BREAKPOINT = 860;
export const DOCK_CONTAINER_MOBILE_BREAKPOINT = 920;

export function getDockResponsiveMode(
  width: number,
  strategy: DockResponsiveStrategy = "viewport"
): DockResponsiveMode {
  const mobileBreakpoint =
    strategy === "container"
      ? DOCK_CONTAINER_MOBILE_BREAKPOINT
      : DOCK_VIEWPORT_MOBILE_BREAKPOINT;

  if (width <= mobileBreakpoint) {
    return "mobile";
  }

  if (width <= DOCK_COMPACT_BREAKPOINT) {
    return "compact";
  }

  return "desktop";
}
