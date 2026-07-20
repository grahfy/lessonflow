"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import {
  getDescendantFolderIds,
  resolveDrop,
  zoneForRect,
  type DndFile,
  type DndFolder,
  type DropResolution,
  type DropTarget
} from "./tree-dnd";

/**
 * Pointer-event drag for the materials tree. No dependency: dnd-kit's
 * `DragOverlay` is `position: fixed`, and this tree renders inside a dialog
 * whose ancestors carry `backdrop-filter` and `transform` — both create a
 * fixed-position containing block, so the overlay would be misplaced. The
 * ghost here is absolutely positioned INSIDE the tree's own root instead.
 * Repo precedent for hand-rolled pointer drag: `practice-audio-player.tsx`.
 *
 * Drag starts from a dedicated grip button, never the row, so the two onClicks
 * already multiplexed on `.nodeRow` survive. Touch scrolling is suppressed by
 * the non-passive `touchmove` listener below, NOT by CSS `touch-action` — see
 * the comment at its registration for why. The tree pans under a finger until
 * the hold arms.
 */

const ARM_DISTANCE_PX = 6;
const TOUCH_HOLD_MS = 180;
const TOUCH_HOLD_TOLERANCE_PX = 8;
const HOVER_EXPAND_MS = 600;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

export type TreeDragItem = {
  kind: "folder" | "file";
  id: string;
  label: string;
};

type Session = {
  item: TreeDragItem;
  pointerId: number;
  handle: HTMLElement;
  touch: boolean;
  originX: number;
  originY: number;
  armed: boolean;
  /** Last pointer position, so autoscroll and hover-expand can re-hit-test. */
  lastX: number;
  lastY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  hoverId: string | null;
  hoverTimer: ReturnType<typeof setTimeout> | null;
  scrollFrame: number | null;
  scrollStep: number;
  /** Removes this session's listeners. `end()` owns calling it. */
  detach: (() => void) | null;
};

type Ghost = { label: string; x: number; y: number };

export interface UseTreeDragOptions {
  enabled: boolean;
  /** Positioned element the ghost is rendered into (must be `position: relative`). */
  rootRef: RefObject<HTMLElement | null>;
  /** The scrolling viewport, for edge auto-scroll. */
  scrollRef: RefObject<HTMLElement | null>;
  folders: DndFolder[];
  materials: DndFile[];
  /** Called when a collapsed folder has been hovered long enough to open. */
  onHoverFolder: (folderId: string) => void;
  /**
   * Receives the FULL resolution, not just the destination. `orderedIds` is the
   * whole point: without it the consumer can only move, and a drop between two
   * rows silently lands at the bottom.
   */
  onDrop: (item: TreeDragItem, resolution: DropResolution) => void;
}

export interface TreeDragState {
  /** The item being dragged, once the gesture has armed. */
  active: TreeDragItem | null;
  /**
   * Destination of the current pointer position: a folder id, `null` for the
   * root, or `undefined` when the pointer is over nothing droppable.
   */
  dropFolderId: string | null | undefined;
  ghost: Ghost | null;
  handleProps: (item: TreeDragItem) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

export function useTreeDrag({
  enabled,
  rootRef,
  scrollRef,
  folders,
  materials,
  onHoverFolder,
  onDrop
}: UseTreeDragOptions): TreeDragState {
  const [active, setActive] = useState<TreeDragItem | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null | undefined>(undefined);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const sessionRef = useRef<Session | null>(null);
  // Mirrors `dropFolderId` so `end()` can read the destination synchronously —
  // committing from inside a state updater would fire the drop twice under
  // StrictMode's double-invoked reducers.
  const dropRef = useRef<DropResolution | null | undefined>(undefined);
  // Latest props, read from the native listeners without re-binding them.
  const latest = useRef({ folders, materials, onHoverFolder, onDrop });
  latest.current = { folders, materials, onHoverFolder, onDrop };

  const stopAutoScroll = useCallback((session: Session) => {
    if (session.scrollFrame !== null) {
      cancelAnimationFrame(session.scrollFrame);
      session.scrollFrame = null;
    }
    session.scrollStep = 0;
  }, []);

  const end = useCallback(
    (commit: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;

      // Unbind FIRST. Every abort path (Escape, `!enabled`, lost capture) funnels
      // through here, and a session whose listeners outlive it re-renders the
      // ghost on the next move while `end()` early-returns on the null ref —
      // leaving the ghost and the .dropInto outline painted with no way to clear.
      session.detach?.();
      session.detach = null;

      if (session.holdTimer) clearTimeout(session.holdTimer);
      if (session.hoverTimer) clearTimeout(session.hoverTimer);
      stopAutoScroll(session);
      if (session.handle.hasPointerCapture(session.pointerId)) {
        session.handle.releasePointerCapture(session.pointerId);
      }

      const destination = dropRef.current;
      dropRef.current = undefined;
      setDropFolderId(undefined);
      if (commit && session.armed && destination) {
        latest.current.onDrop(session.item, destination);
      }
      if (!commit && session.armed) {
        // Releasing capture re-targets the trailing mouseup at whatever is under
        // the cursor, so an aborted drag would fire the row's onClick and
        // navigate/collapse it. Swallow exactly one click.
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        // Nothing may have been clicked at all; drop the trap on the next tick.
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      setActive(null);
      setGhost(null);
    },
    [stopAutoScroll]
  );

  // Breaks the track ↔ scheduleHover cycle: the hover timer re-tracks long
  // after the render that armed it, so it reads the current `track` here
  // instead of capturing one and forcing both into each other's dep arrays.
  const trackRef = useRef<(session: Session, clientX: number, clientY: number) => void>(() => {});

  /** Hit-tests the pointer position and updates the highlighted destination. */
  const track = useCallback(
    (session: Session, clientX: number, clientY: number) => {
      /** Arms the 600ms hover-to-expand timer for a folder row. */
      const scheduleHover = (folderId: string | null) => {
        if (session.hoverId === folderId) return;
        session.hoverId = folderId;
        if (session.hoverTimer) clearTimeout(session.hoverTimer);
        session.hoverTimer = null;
        if (!folderId) return;
        // Never expand into the folder being dragged (or its own subtree).
        if (session.item.kind === "folder") {
          if (folderId === session.item.id) return;
          if (getDescendantFolderIds(latest.current.folders, session.item.id).has(folderId)) return;
        }
        session.hoverTimer = setTimeout(() => {
          latest.current.onHoverFolder(folderId);
          // Expanding shifts every row below it. Without a re-hit-test the drop
          // commits against pre-expansion geometry if the pointer never moves
          // again. rAF so the new children are laid out before elementFromPoint.
          requestAnimationFrame(() => {
            if (sessionRef.current === session) trackRef.current(session, session.lastX, session.lastY);
          });
        }, HOVER_EXPAND_MS);
      };

      const root = rootRef.current;
      if (root) {
        const rootRect = root.getBoundingClientRect();
        // getBoundingClientRect is the border box; `position: absolute` resolves
        // against the padding box. clientLeft/Top is the border width.
        setGhost({
          label: session.item.label,
          x: clientX - rootRect.left - root.clientLeft,
          y: clientY - rootRect.top - root.clientTop
        });
      }

      const element = document.elementFromPoint(clientX, clientY);
      const row = element ? (element.closest("[data-drop-id]") as HTMLElement | null) : null;
      const dropId = row?.dataset.dropId;
      const dropKind = row?.dataset.dropKind as DropTarget["kind"] | undefined;

      if (!row || !dropId || !dropKind) {
        dropRef.current = undefined;
        setDropFolderId(undefined);
        scheduleHover(null);
        return;
      }

      const rect = row.getBoundingClientRect();
      const zone =
        dropKind === "root" ? "into" : zoneForRect(clientY, rect, dropKind === "folder", session.touch);
      const resolved = resolveDrop(
        session.item,
        { kind: dropKind, id: dropId, zone },
        latest.current.folders,
        latest.current.materials
      );
      dropRef.current = resolved ?? undefined;
      setDropFolderId(resolved ? resolved.folderId : undefined);
      scheduleHover(dropKind === "folder" ? dropId : null);
    },
    [rootRef]
  );
  trackRef.current = track;

  /** Keeps scrolling while the pointer sits within 48px of a viewport edge. */
  const updateAutoScroll = useCallback(
    (session: Session, clientY: number) => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      let step = 0;
      if (clientY < rect.top + AUTOSCROLL_EDGE_PX) step = -AUTOSCROLL_STEP_PX;
      else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) step = AUTOSCROLL_STEP_PX;

      session.scrollStep = step;
      if (step === 0) {
        stopAutoScroll(session);
        return;
      }
      if (session.scrollFrame !== null) return;
      const tick = () => {
        const current = sessionRef.current;
        if (!current || current !== session || current.scrollStep === 0) {
          session.scrollFrame = null;
          return;
        }
        viewport.scrollBy(0, current.scrollStep);
        // Rows slide under a stationary cursor. Without this re-hit-test the
        // destination stays pinned to whatever row was there at the last
        // pointermove and the drop silently lands in the wrong folder.
        track(current, current.lastX, current.lastY);
        session.scrollFrame = requestAnimationFrame(tick);
      };
      session.scrollFrame = requestAnimationFrame(tick);
    },
    [scrollRef, stopAutoScroll, track]
  );

  // Global listeners live only for the duration of a gesture; pointer capture
  // guarantees move/up land on the handle, but Escape and cancel do not.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") end(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, end]);

  const handleProps = useCallback(
    (item: TreeDragItem) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (!enabled || sessionRef.current) return;
        const touch = event.pointerType === "touch";
        // Secondary buttons never drag — including a pen's barrel button.
        if (event.button !== 0 && !touch) return;
        // Without this a mouse drag paints a text selection across the tree;
        // `touch-action` does not suppress selection.
        event.preventDefault();

        const handle = event.currentTarget;
        const session: Session = {
          item,
          pointerId: event.pointerId,
          handle,
          touch,
          originX: event.clientX,
          originY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          armed: false,
          holdTimer: null,
          hoverId: null,
          hoverTimer: null,
          scrollFrame: null,
          scrollStep: 0,
          detach: null
        };
        sessionRef.current = session;
        handle.setPointerCapture(event.pointerId);

        const arm = (clientX: number, clientY: number) => {
          session.armed = true;
          setActive(session.item);
          track(session, clientX, clientY);
        };

        if (touch) {
          // Hold-to-drag: a finger that moves before the timer fires is a scroll.
          session.holdTimer = setTimeout(() => {
            session.holdTimer = null;
            if (sessionRef.current === session) arm(session.originX, session.originY);
          }, TOUCH_HOLD_MS);
        }

        const onMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== session.pointerId) return;
          session.lastX = moveEvent.clientX;
          session.lastY = moveEvent.clientY;
          const dx = moveEvent.clientX - session.originX;
          const dy = moveEvent.clientY - session.originY;

          if (!session.armed) {
            const distance = Math.hypot(dx, dy);
            if (touch) {
              if (distance > TOUCH_HOLD_TOLERANCE_PX) {
                // Moved before the hold elapsed — treat it as a scroll, not a drag.
                end(false);
              }
              return;
            }
            if (distance < ARM_DISTANCE_PX) return;
            arm(moveEvent.clientX, moveEvent.clientY);
          }

          moveEvent.preventDefault();
          track(session, moveEvent.clientX, moveEvent.clientY);
          updateAutoScroll(session, moveEvent.clientY);
        };

        const onUp = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== session.pointerId) return;
          end(true);
        };

        const onCancel = (cancelEvent: PointerEvent) => {
          if (cancelEvent.pointerId !== session.pointerId) return;
          end(false);
        };

        // Capture is implicitly released if the grip node is replaced mid-drag
        // (router.refresh(), a `folders` props swap, a re-key). Handle-bound
        // listeners would die with it and the session would never end.
        const onLostCapture = (lostEvent: PointerEvent) => {
          if (lostEvent.pointerId !== session.pointerId) return;
          end(false);
        };

        // Bound to window, not the handle: capture already retargets move/up
        // here, so nothing is lost, and they survive the grip being re-rendered.
        // The grip no longer sets `touch-action: none`, so a finger can pan the
        // tree from it like anywhere else. Scrolling is suppressed here instead,
        // and only once the hold has armed — `touch-action` is read when the
        // gesture starts, so it cannot be applied lazily at that moment.
        // MUST be `{ passive: false }` or preventDefault() is ignored.
        const onTouchMove = (touchEvent: TouchEvent) => {
          if (session.armed) touchEvent.preventDefault();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        handle.addEventListener("lostpointercapture", onLostCapture);
        if (touch) window.addEventListener("touchmove", onTouchMove, { passive: false });
        session.detach = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onCancel);
          handle.removeEventListener("lostpointercapture", onLostCapture);
          window.removeEventListener("touchmove", onTouchMove);
        };
      }
    }),
    [enabled, end, track, updateAutoScroll]
  );

  // A tree that loses DnD mid-gesture (search typed, props swapped) must not
  // leave a ghost or a captured pointer behind.
  useEffect(() => {
    if (!enabled && sessionRef.current) end(false);
  }, [enabled, end]);

  // Unmounting mid-gesture: refs survive on a detached fiber, so the rAF loop
  // would keep calling scrollBy on a detached node every frame forever and the
  // hover timer would setState after unmount. No `end()` here — that setStates.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      session.detach?.();
      if (session.holdTimer) clearTimeout(session.holdTimer);
      if (session.hoverTimer) clearTimeout(session.hoverTimer);
      if (session.scrollFrame !== null) cancelAnimationFrame(session.scrollFrame);
    },
    []
  );

  return { active, dropFolderId, ghost, handleProps };
}
