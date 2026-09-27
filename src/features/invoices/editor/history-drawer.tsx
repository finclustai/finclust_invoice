"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  Check,
  CircleDollarSign,
  FilePlus2,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import type { Change } from "@/domain/invoice/diff";
import { restoreVersion } from "../actions";
import type { TimelineEntry, TimelineKind } from "../versions";

const ICON: Record<TimelineKind, typeof Pencil> = {
  created: FilePlus2,
  edited: Pencil,
  issued: Send,
  restored: RotateCcw,
  cancelled: Ban,
  sent: Send,
  paid: CircleDollarSign,
};

const LABEL: Record<TimelineKind, string> = {
  created: "Created",
  edited: "Edited",
  issued: "Issued",
  restored: "Restored",
  cancelled: "Cancelled",
  sent: "Sent",
  paid: "Paid",
};

/** "2 hours ago" — relative up to a month, then the date. */
function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (seconds < 2592000) {
    const d = Math.floor(seconds / 86400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function HistoryDrawer({
  invoiceId,
  entries,
  canRestore,
  onClose,
  loadChanges,
}: {
  invoiceId: string;
  entries: TimelineEntry[];
  canRestore: boolean;
  onClose: () => void;
  loadChanges: (versionId: string) => Promise<Change[]>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, Change[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // <dialog> gives focus containment, Escape and an inert background for free.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function toggle(entry: TimelineEntry) {
    if (openId === entry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(entry.id);
    if (changes[entry.id] || entry.version === null) return;
    setLoadingId(entry.id);
    const loaded = await loadChanges(entry.id);
    setChanges((c) => ({ ...c, [entry.id]: loaded }));
    setLoadingId(null);
  }

  async function onRestore(entry: TimelineEntry) {
    const when = relative(entry.at);
    if (!confirm(`Put the invoice back to how it was ${when}?\n\nNothing is deleted — this is added to the history as a new entry.`)) {
      return;
    }
    setBusy(entry.id);
    setError(null);
    const result = await restoreVersion(invoiceId, entry.id);
    setBusy(null);
    if (result.ok) window.location.reload();
    else setError(result.problems[0] ?? "Could not restore");
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="history-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-0 ml-auto h-dvh w-full max-w-md border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40 sm:border-l"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 id="history-title" className="font-extrabold">
            History
          </h2>
          <p className="text-xs text-mid">Everything that has happened to this invoice</p>
        </div>
        <button type="button" className="btn field-sm" onClick={() => dialog.current?.close()} aria-label="Close history">
          <X size={15} aria-hidden />
        </button>
      </header>

      {error && (
        <p role="alert" className="error-line m-3">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-mid">
          Nothing has changed yet. Edits, sends and payments will show up here.
        </p>
      ) : (
        <ol className="overflow-y-auto" style={{ maxHeight: "calc(100dvh - 73px)" }}>
          {entries.map((entry) => {
            const Icon = ICON[entry.kind];
            const expanded = openId === entry.id;
            const rows = changes[entry.id];
            return (
              <li key={entry.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sand"
                  aria-expanded={expanded}
                  onClick={() => void toggle(entry)}
                >
                  <span className="mt-0.5 rounded-full bg-sand p-1.5 text-mid" aria-hidden>
                    <Icon size={14} strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{LABEL[entry.kind]}</span>
                      {entry.changeCount > 1 && (
                        <span className="chip status-draft">{entry.changeCount} changes</span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-mid" title={new Date(entry.at).toLocaleString("en-IN")}>
                        {relative(entry.at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-body">{entry.summary}</span>
                    {entry.actor && <span className="block text-xs text-mid">{entry.actor}</span>}
                  </span>
                </button>

                {expanded && (
                  <div className="bg-sand px-4 pt-1 pb-3">
                    <ChangeList rows={loadingId === entry.id ? undefined : (rows ?? [])} />
                    {canRestore && entry.canRestore && (
                      // Inside the expanded entry, never on the row itself, so
                      // it cannot be hit while scanning the timeline.
                      <button
                        type="button"
                        className="btn field-sm mt-3"
                        disabled={busy === entry.id}
                        onClick={() => void onRestore(entry)}
                      >
                        {busy === entry.id ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw size={14} aria-hidden />
                        )}
                        Restore this version
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </dialog>
  );
}

const MAX_SHOWN = 6;

function ChangeList({ rows }: { rows: Change[] | undefined }) {
  const [all, setAll] = useState(false);
  if (rows === undefined) {
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-mid">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Working out what changed…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-xs text-mid">
        <Check size={13} aria-hidden />
        Nothing changed in this version.
      </p>
    );
  }
  const shown = all ? rows : rows.slice(0, MAX_SHOWN);
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-1 text-xs">
        {shown.map((c) => (
          <div key={c.label} className="contents">
            <dt className="text-mid">{c.label}</dt>
            <dd className="tnum">
              {c.from && <span className="text-mid line-through">{c.from}</span>}
              {c.from && c.to && <span className="text-mid"> → </span>}
              {c.to && <span className="font-semibold">{c.to}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {rows.length > MAX_SHOWN && !all && (
        <button type="button" className="text-xs font-semibold text-mid underline" onClick={() => setAll(true)}>
          Show all {rows.length}
        </button>
      )}
    </>
  );
}
