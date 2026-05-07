import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface UnsavedChangesCtx {
  setDirty: (id: string, dirty: boolean) => void;
  unregister: (id: string) => void;
  hasDirty: () => boolean;
  confirmDiscard: (message?: string) => boolean;
}

const Ctx = createContext<UnsavedChangesCtx | null>(null);

const DEFAULT_MESSAGE =
  "You have unsaved changes. Discard them and continue?";

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirtyMap = useRef<Map<string, boolean>>(new Map());
  const [isAnyDirty, setIsAnyDirty] = useState(false);

  const recompute = useCallback(() => {
    let any = false;
    for (const v of dirtyMap.current.values()) {
      if (v) { any = true; break; }
    }
    setIsAnyDirty(any);
  }, []);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    dirtyMap.current.set(id, dirty);
    recompute();
  }, [recompute]);

  const unregister = useCallback((id: string) => {
    dirtyMap.current.delete(id);
    recompute();
  }, [recompute]);

  // Read latest value via ref so callbacks (popstate / beforeunload) don't
  // close over stale state.
  const dirtyRef = useRef(isAnyDirty);
  dirtyRef.current = isAnyDirty;
  const hasDirty = useCallback(() => dirtyRef.current, []);

  const confirmDiscard = useCallback(
    (message: string = DEFAULT_MESSAGE) => {
      if (!dirtyRef.current) return true;
      return window.confirm(message);
    },
    [],
  );

  // Native browser confirm before reload / tab close while dirty.
  useEffect(() => {
    if (!isAnyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnyDirty]);

  // Guard browser back/forward inside the SPA — only while there are
  // unsaved edits. The sentinel is added on transition to dirty and torn
  // down when the form goes clean again, so clean navigation away from the
  // page is never intercepted (no infinite-back trap).
  //
  // We tag the sentinel with a monotonically-increasing sequence number so
  // that on `popstate` we can tell direction (the new entry's seq is lower
  // for back, higher for forward). On confirm we re-trigger the same
  // direction so the navigation completes in one step; on cancel we step
  // the opposite direction to restore the sentinel position.
  useEffect(() => {
    if (!isAnyDirty) return;
    if (typeof window === "undefined") return;

    const KEY = "__unsavedSeq";
    type GuardState = { [KEY]?: number } | null;
    const readSeq = (s: GuardState): number =>
      (s && typeof s[KEY] === "number" ? (s[KEY] as number) : 0);

    let seq = readSeq(window.history.state as GuardState) + 1;
    let currentSeq = seq;
    const arm = () => {
      window.history.pushState({ [KEY]: seq }, "", window.location.href);
      currentSeq = seq;
      seq += 1;
    };
    arm();

    let suppressNext = false;
    const onPop = (e: PopStateEvent) => {
      const newSeq = readSeq(e.state as GuardState);
      if (suppressNext) {
        suppressNext = false;
        currentSeq = newSeq;
        return;
      }
      const wentBack = newSeq < currentSeq;
      currentSeq = newSeq;
      // Re-check dirty at the moment the user navigates — they may have
      // saved between the dirty effect arming and pressing back.
      if (!dirtyRef.current) return;
      if (window.confirm(DEFAULT_MESSAGE)) {
        suppressNext = true;
        if (wentBack) window.history.back();
        else window.history.forward();
      } else {
        suppressNext = true;
        if (wentBack) window.history.forward();
        else window.history.back();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Intentionally do NOT call history.back() here — it would fight
      // legitimate route changes (e.g. logout → /login) by snapping the
      // user back to the admin page. The leftover sentinel is harmless:
      // it shares the current URL, so an extra back press lands the user
      // on the same page they were already on.
    };
  }, [isAnyDirty]);

  return (
    <Ctx.Provider value={{ setDirty, unregister, hasDirty, confirmDiscard }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Register a dirty-state source with the surrounding UnsavedChangesProvider.
 * The provider arms its navigation guards only while at least one consumer
 * reports `isDirty === true`, so clean forms never interfere with normal
 * routing.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const ctx = useContext(Ctx);
  const id = useId();
  useEffect(() => {
    if (!ctx) return;
    ctx.setDirty(id, isDirty);
    return () => ctx.unregister(id);
  }, [ctx, id, isDirty]);
}

/**
 * Returns a function that prompts the user when there are unsaved edits.
 * Returns true if it's safe to navigate away, false if the user cancelled.
 * When no provider is mounted (e.g. tests), navigation is always allowed.
 */
export function useConfirmDiscard() {
  const ctx = useContext(Ctx);
  return useCallback(
    (message?: string) => (ctx ? ctx.confirmDiscard(message) : true),
    [ctx],
  );
}
