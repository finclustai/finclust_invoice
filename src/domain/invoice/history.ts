import type { Change } from "./diff";
import type { InvoiceState } from "./status";

/**
 * How long a run of edits counts as one sitting.
 *
 * Autosave writes every time typing stops, so without this an afternoon of
 * work becomes hundreds of timeline rows and the history is unreadable — which
 * defeats the point of keeping it. Thirty minutes because the unit a person
 * recognises is "the change I made after lunch", not the keystroke at 14:03:11.
 */
export const SESSION_MINUTES = 30;

export interface SessionHead {
  userId: string | null;
  state: InvoiceState;
  at: number;
}

/**
 * Whether a save belongs to the entry already at the top of the timeline.
 *
 * Author and state must match: merging two people's edits would credit one
 * with the other's work, and an edit before issuing is a different thing from
 * one after. An unknown author never merges — two nulls are not the same
 * person.
 */
export function joinsSession(head: SessionHead | null, next: SessionHead): boolean {
  if (!head) return false;
  if (head.userId === null || next.userId === null) return false;
  if (head.userId !== next.userId) return false;
  if (head.state !== next.state) return false;
  return next.at - head.at <= SESSION_MINUTES * 60_000;
}

/** A one-line description of an edit, short enough to scan down a timeline. */
export function summarise(changes: Change[]): string {
  const labels = changes.map((c) => c.label);
  if (labels.length === 0) return "No changes";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}
