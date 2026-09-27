"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import type { SaveResult } from "../actions";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error" | "conflict";
  savedAt?: number;
  message?: string;
}

const DEBOUNCE_MS = 800;

/**
 * Saves the draft shortly after typing stops, and again when the tab is hidden
 * or closed, so work is never lost to a closed laptop.
 *
 * It holds the version it last saw saved and hands it to every write, so a
 * second tab editing the same invoice is reported as a conflict rather than
 * silently overwritten. On a conflict it stops saving: continuing would keep
 * failing, and the user's typed text stays in the form either way.
 */
export function useAutosave(
  draft: InvoiceDraft,
  initialVersion: number,
  options: { enabled: boolean; save: (draft: InvoiceDraft, version: number) => Promise<SaveResult> },
): SaveState & { retry: () => void } {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const version = useRef(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Refs so the flush handlers below never capture a stale draft.
  const latest = useRef(draft);
  const lastSaved = useRef(JSON.stringify(draft));
  const stopped = useRef(false);
  const saveRef = useRef(options.save);

  latest.current = draft;
  saveRef.current = options.save;

  const flush = useCallback(async () => {
    if (stopped.current) return;
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === lastSaved.current) return; // nothing changed; don't write
    setState({ status: "saving" });
    const result = await saveRef.current(latest.current, version.current);
    if (result.ok) {
      version.current = result.version;
      lastSaved.current = snapshot;
      setState({ status: "saved", savedAt: Date.now() });
      return;
    }
    if (result.reason === "conflict") {
      stopped.current = true;
      setState({
        status: "conflict",
        message: "This invoice was changed somewhere else. Reload to see the latest — what you typed is still here.",
      });
      return;
    }
    setState({ status: "error", message: result.problems?.[0] ?? "Could not save" });
  }, []);

  useEffect(() => {
    if (!options.enabled || stopped.current) return;
    if (JSON.stringify(draft) === lastSaved.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [draft, options.enabled, flush]);

  useEffect(() => {
    if (!options.enabled) return;
    // A closed tab or a switched app should not cost the last few seconds of typing.
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer.current);
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [options.enabled, flush]);

  const retry = useCallback(() => {
    stopped.current = false;
    void flush();
  }, [flush]);

  return { ...state, retry };
}
