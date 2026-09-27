"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import type { SaveResult } from "../write-draft";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error" | "conflict";
  savedAt?: number;
  message?: string;
}

export interface Autosave extends SaveState {
  /** The version the server last confirmed. Anything that writes must use this. */
  version: number;
  dirty: boolean;
  /** Writes pending changes now and resolves once they have landed. */
  flushNow: () => Promise<SaveResult | null>;
  retry: () => void;
}

const DEBOUNCE_MS = 800;

/**
 * Saves the draft shortly after typing stops.
 *
 * Three things here exist because of how badly each fails otherwise:
 *
 * - **Saves are serialised.** Two overlapping writes would both carry the same
 *   expected version, the second would be told "conflict", and the user would
 *   see "changed somewhere else" with no second tab in sight. A save already in
 *   flight therefore sets a flag instead of starting another, and the follow-up
 *   runs when the first returns, with the version it produced.
 * - **Every failure is caught.** A rejected request (wifi gone, session expired)
 *   would otherwise leave the header saying "Saving…" forever while nothing is
 *   written and the user keeps typing.
 * - **Pending work is flushed on unmount.** Clicking a sidebar link is a
 *   client-side navigation: no pagehide, no visibilitychange. Without this the
 *   last thing typed is dropped silently.
 */
export function useAutosave(
  draft: InvoiceDraft,
  initialVersion: number,
  options: { enabled: boolean; save: (draft: InvoiceDraft, version: number) => Promise<SaveResult> },
): Autosave {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const [version, setVersion] = useState(initialVersion);

  // Refs so the unmount and unload handlers never act on a stale draft.
  const latest = useRef(draft);
  const versionRef = useRef(initialVersion);
  const lastSaved = useRef(JSON.stringify(draft));
  const inFlight = useRef(false);
  const queued = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(options.save);
  const enabledRef = useRef(options.enabled);

  latest.current = draft;
  saveRef.current = options.save;
  enabledRef.current = options.enabled;

  const dirty = JSON.stringify(draft) !== lastSaved.current;

  const flush = useCallback(async (): Promise<SaveResult | null> => {
    if (!enabledRef.current || stopped.current) return null;
    if (inFlight.current) {
      queued.current = true; // run once the current write returns
      return null;
    }
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === lastSaved.current) return null;

    inFlight.current = true;
    setState({ status: "saving" });
    try {
      const result = await saveRef.current(latest.current, versionRef.current);
      if (result.ok) {
        versionRef.current = result.version;
        setVersion(result.version);
        lastSaved.current = snapshot;
        setState({ status: "saved", savedAt: Date.now() });
      } else if (result.reason === "conflict") {
        // Genuine: saves are serialised, so this really is another tab.
        stopped.current = true;
        setState({
          status: "conflict",
          message: "Someone else changed this invoice. Copy anything you still need, then reload.",
        });
      } else {
        setState({ status: "error", message: result.problems?.[0] ?? "Could not save" });
      }
      return result;
    } catch {
      // A rejected request: the session expired, or the network went away.
      setState({ status: "error", message: "Couldn’t save — check your connection" });
      return null;
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void flush();
      }
    }
  }, []);

  useEffect(() => {
    if (!options.enabled || stopped.current) return;
    if (JSON.stringify(draft) === lastSaved.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [draft, options.enabled, flush]);

  // Leaving the page (a sidebar link, a closed tab, a switched app) must not
  // cost the last few seconds of typing.
  useEffect(() => {
    if (!options.enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer.current);
        void flush();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== lastSaved.current) {
        // The browser shows its own wording; returnValue is what triggers it.
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Unmount: a client-side navigation fires none of the events above, and
      // the request survives the component, so start it on the way out.
      clearTimeout(timer.current);
      void flush();
    };
  }, [options.enabled, flush]);

  const flushNow = useCallback(async () => {
    clearTimeout(timer.current);
    return flush();
  }, [flush]);

  const retry = useCallback(() => {
    stopped.current = false;
    void flush();
  }, [flush]);

  return { ...state, version, dirty, flushNow, retry };
}
