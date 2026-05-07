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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnsavedChangesCtx {
  setDirty: (id: string, dirty: boolean) => void;
  unregister: (id: string) => void;
  hasDirty: () => boolean;
  confirmDiscard: (message?: string) => Promise<boolean>;
}

const Ctx = createContext<UnsavedChangesCtx | null>(null);

const DEFAULT_TITLE = "Discard unsaved changes?";
const DEFAULT_MESSAGE =
  "You have unsaved changes. If you continue, they will be lost.";

interface DialogState {
  message: string;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirtyMap = useRef<Map<string, boolean>>(new Map());
  const [isAnyDirty, setIsAnyDirty] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

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

  // Keep a ref to any pending dialog promise resolver so popstate / unmount
  // can resolve it deterministically without relying on stale state closures.
  const pendingResolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirmDiscard = useCallback(
    (message: string = DEFAULT_MESSAGE) => {
      if (!dirtyRef.current) return Promise.resolve(true);
      // If a previous prompt is somehow still pending, resolve it as
      // cancelled before opening a new one.
      if (pendingResolveRef.current) {
        pendingResolveRef.current(false);
        pendingResolveRef.current = null;
      }
      return new Promise<boolean>((resolve) => {
        pendingResolveRef.current = resolve;
        setDialog({ message });
      });
    },
    [],
  );

  const handleDialogResult = useCallback((confirmed: boolean) => {
    const resolver = pendingResolveRef.current;
    pendingResolveRef.current = null;
    setDialog(null);
    resolver?.(confirmed);
  }, []);

  // If the provider unmounts while a confirm prompt is still pending,
  // resolve it as cancelled so awaiting callers don't hang forever.
  useEffect(() => {
    return () => {
      if (pendingResolveRef.current) {
        pendingResolveRef.current(false);
        pendingResolveRef.current = null;
      }
    };
  }, []);

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
      void confirmDiscard().then((ok) => {
        if (ok) {
          suppressNext = true;
          if (wentBack) window.history.back();
          else window.history.forward();
        } else {
          suppressNext = true;
          if (wentBack) window.history.forward();
          else window.history.back();
        }
      });
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
  }, [isAnyDirty, confirmDiscard]);

  return (
    <Ctx.Provider value={{ setDirty, unregister, hasDirty, confirmDiscard }}>
      {children}
      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && pendingResolveRef.current) {
            handleDialogResult(false);
          }
        }}
      >
        <AlertDialogContent data-testid="unsaved-changes-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{DEFAULT_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.message ?? DEFAULT_MESSAGE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="unsaved-changes-cancel"
              onClick={() => handleDialogResult(false)}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="unsaved-changes-confirm"
              onClick={() => handleDialogResult(true)}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
 * Resolves to true if it's safe to navigate away, false if the user cancelled.
 * When no provider is mounted (e.g. tests), navigation is always allowed.
 */
export function useConfirmDiscard() {
  const ctx = useContext(Ctx);
  return useCallback(
    (message?: string): Promise<boolean> =>
      ctx ? ctx.confirmDiscard(message) : Promise.resolve(true),
    [ctx],
  );
}
