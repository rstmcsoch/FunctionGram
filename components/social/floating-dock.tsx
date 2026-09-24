"use client";
import { memo, useCallback, useEffect, useRef } from "react";
import { Home, Search, Compass, Clapperboard, UserRound, Plus } from "lucide-react";
import { Avatar } from "./common";
import { useDockVisibility } from "@/hooks/use-dock-visibility";
import type { Person } from "@/lib/types";

/**
 * Floating "liquid glass" bottom navigation for phones and tablets.
 *
 * Visual/interaction layer only: every item calls the exact same handler the
 * previous fixed bar used, so routes, dialogs and auth gating are unchanged.
 * The component is memoised and owns its own visibility, so hiding or showing
 * the dock while scrolling never re-renders the feed.
 */

type DockItem = { id: string; label: string; icon: typeof Home };

const items: DockItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "create", label: "Create", icon: Plus },
  { id: "reels", label: "Reels", icon: Clapperboard },
  { id: "profile", label: "Profile", icon: UserRound },
];

type FloatingDockProps = {
  active: string;
  me: Person | null;
  onSelect: (id: string) => void;
  /** True while a full-screen viewer or bottom sheet owns the screen. */
  covered?: boolean;
};

export const FloatingDock = memo(function FloatingDock({ active, me, onSelect, covered = false }: FloatingDockProps) {
  const { ref, hidden, show, hide } = useDockVisibility();
  const list = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);

  /* Place the active capsule under the selected item. Positions are measured
     from the rendered buttons so the pill stays correct across viewport
     widths, text scaling, zoom and orientation changes. */
  const place = useCallback((animate: boolean) => {
    const container = list.current;
    const pill = indicator.current;
    if (!container || !pill) return;
    const target = container.querySelector<HTMLElement>('[data-active="true"]')
      || container.querySelector<HTMLElement>(".dock-item");
    if (!target) return;
    // Repositioning after a layout change must not look like a tab switch.
    container.dataset.dockReady = animate ? "true" : "";
    const size = Math.min(target.offsetWidth, target.offsetHeight);
    pill.style.width = size + "px";
    pill.style.height = size + "px";
    pill.style.transform =
      "translate3d(" + (target.offsetLeft + (target.offsetWidth - size) / 2) + "px," +
      (target.offsetTop + (target.offsetHeight - size) / 2) + "px,0)";
    if (!animate) requestAnimationFrame(() => { container.dataset.dockReady = "true"; });
  }, []);

  // Full-screen viewers take the screen: step the dock out of the way.
  useEffect(() => { if (covered) hide(); else show(); }, [covered, hide, show]);
  // Switching tabs always hands the bar back to the user.
  useEffect(() => { show(); }, [active, show]);
  // Slide the capsule on selection, then keep it aligned on resize.
  useEffect(() => { place(true); }, [active, place]);

  useEffect(() => {
    const container = list.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [place]);

  return (
    <nav
      ref={ref as React.RefObject<HTMLElement>}
      className="dock"
      data-state={hidden || covered ? "hidden" : "visible"}
      aria-label="Bottom navigation"
      aria-hidden={covered || undefined}
      inert={covered}
      onFocus={show}
    >
      <div className="dock-list" ref={list} data-dock-ready="true">
        <span className="dock-indicator" ref={indicator} aria-hidden="true" />
        {items.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={"dock-item" + (item.id === "create" ? " dock-create" : "")}
              data-active={isActive ? "true" : "false"}
              data-id={item.id}
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
            >
              <span className="dock-glyph">
                {item.id === "create"
                  ? <Plus strokeWidth={2.3} />
                  : item.id === "profile" && me
                    ? <Avatar person={me} size={28} />
                    : <item.icon fill={isActive && item.id === "home" ? "currentColor" : "none"} strokeWidth={isActive ? 2.15 : 1.85} />}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
