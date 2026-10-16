import { useEffect, useState, type RefObject } from "react";

export const PILL_TITLE = "Send a Linear issue";

const ADJACENT_PX = 40;
const OFF_SCREEN_PX = -1000;
const MAX_FRAMES = 30;

function isNextToVisiblePill(surface: DOMRect): boolean {
  const pills = document.querySelectorAll<HTMLElement>(`[aria-label="${PILL_TITLE}"]`);
  for (const pill of pills) {
    const rect = pill.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const overlapsHorizontally = surface.left < rect.right && surface.right > rect.left;
    const touchesVertically =
      Math.abs(surface.bottom - rect.top) < ADJACENT_PX || Math.abs(surface.top - rect.bottom) < ADJACENT_PX;
    if (overlapsHorizontally && touchesVertically) return true;
  }
  return false;
}

/**
 * Paseo 0.11.4 keeps other workspaces mounted but hidden, and every mounted copy of an agent's
 * composer opens this popover together because they share one open state. Copies whose button is
 * hidden get placed at the window's top-left corner. Each popover hides itself unless it sits
 * next to a visible Linear button, and reports whether it may take focus.
 */
export function useStrayPopoverGuard(rootRef: RefObject<unknown>, enabled: boolean): boolean {
  const [anchored, setAnchored] = useState(!enabled);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) {
      setAnchored(true);
      return undefined;
    }
    const surface = root.closest<HTMLElement>('[data-menu-surface="true"]') ?? root;
    let frame = 0;
    let handle = 0;
    const check = () => {
      const rect = surface.getBoundingClientRect();
      // Paseo first renders the popover off-screen to measure it, then moves it into place.
      if (rect.left < OFF_SCREEN_PX || rect.top < OFF_SCREEN_PX) {
        if (++frame < MAX_FRAMES) handle = requestAnimationFrame(check);
        return;
      }
      if (isNextToVisiblePill(rect)) {
        setAnchored(true);
        return;
      }
      surface.style.visibility = "hidden";
      surface.style.pointerEvents = "none";
    };
    handle = requestAnimationFrame(check);
    return () => cancelAnimationFrame(handle);
  }, [rootRef, enabled]);

  return anchored;
}
