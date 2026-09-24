"use client";
import * as React from "react";

/**
 * Scroll-aware visibility for the floating mobile navigation dock.
 *
 * The dock slides away while the page travels towards its content (scrolling
 * down) and returns as soon as the direction flips the other way — a very
 * small upward movement is enough, so the bar never feels like it has to be
 * "earned" back.
 *
 * Implementation notes:
 * - one rAF-throttled, passive listener; scroll positions are only read inside
 *   that frame, so nothing forces layout on every raw scroll event.
 * - the listener is registered in the capture phase, which also picks up the
 *   inner scroll containers (reels track, chat history) that do not move the
 *   window itself.
 * - a small threshold per direction keeps browser/rubber-band noise from
 *   toggling the bar, and the state is applied as a class on the element
 *   instead of React state so the feed never re-renders when it flips.
 */

/** Distance (px) of downward travel before the dock hides. */
const HIDE_THRESHOLD = 10;
/** Distance (px) of upward travel before the dock returns — deliberately tiny. */
const SHOW_THRESHOLD = 4;
/** Above this scroll offset the dock is always visible. */
const TOP_EDGE = 2;
/** Milliseconds without scroll activity before the pending direction resets. */
const IDLE_RESET = 140;

export function useDockVisibility() {
  const element = React.useRef<HTMLElement | null>(null);
  const [hidden, setHidden] = React.useState(false);

  const state = React.useRef({
    frame: 0,
    last: -1,
    anchor: -1,
    direction: 0,
    idle: 0,
    covered: false,
  });

  /** Reads the scroll offset of the window or of an inner scroll container. */
  const positionOf = React.useCallback((target: EventTarget | null) => {
    if (!target || target === window || target === document || target === document.documentElement || target === document.body) {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }
    return (target as HTMLElement).scrollTop ?? 0;
  }, []);

  const apply = React.useCallback((value: boolean) => {
    state.current.covered = value;
    element.current?.classList.toggle("dock-hidden", value);
    setHidden(value);
  }, []);

  const show = React.useCallback(() => apply(false), [apply]);
  const hide = React.useCallback(() => apply(true), [apply]);

  React.useEffect(() => {
    const tracked = state.current;
    tracked.last = window.scrollY;
    tracked.anchor = tracked.last;

    const onScroll = (event: Event) => {
      if (tracked.frame) return;
      tracked.frame = requestAnimationFrame(() => {
        tracked.frame = 0;
        const y = Math.max(0, positionOf(event.target));
        const from = tracked.last;
        tracked.last = y;
        if (y === from) return;

        // A pause in scrolling forgets the pending direction, so the next
        // movement is always judged from where the user actually stopped.
        const now = performance.now();
        if (tracked.direction !== 0 && now - tracked.idle > IDLE_RESET) {
          tracked.direction = 0;
          tracked.anchor = from;
        }
        tracked.idle = now;

        const delta = y - from;
        const direction = delta > 0 ? 1 : -1;
        if (direction !== tracked.direction) {
          tracked.direction = direction;
          tracked.anchor = from;
        }
        const travelled = Math.abs(y - tracked.anchor);

        // The very top always shows the bar; direction changes react at once.
        if (direction < 0 && (travelled >= SHOW_THRESHOLD || y <= TOP_EDGE)) apply(false);
        else if (direction > 0 && travelled >= HIDE_THRESHOLD && y > TOP_EDGE) apply(true);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      if (tracked.frame) cancelAnimationFrame(tracked.frame);
      tracked.frame = 0;
    };
  }, [apply, positionOf]);

  return { ref: element, hidden, show, hide };
}
