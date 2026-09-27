"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { CalculatedInvoice } from "@/domain/invoice/calculate";
import type { InvoiceLine } from "@/domain/invoice/schema";
import type { CatalogItem } from "@/features/catalog/queries";
import { formatAmount, type CurrencyCode } from "@/domain/money/currency";
import { MoneyInput } from "./money-input";
import { addRow, moveRow, removeRow, updateRow } from "./rows";

interface GridProps {
  catalog: CatalogItem[];
  lines: InvoiceLine[];
  calc: CalculatedInvoice<InvoiceLine>;
  currency: CurrencyCode;
  showHsn: boolean;
  disabled: boolean;
  onChange: (lines: InvoiceLine[]) => void;
}

export function LineGrid({ catalog, lines, calc, currency, showHsn, disabled, onChange }: GridProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const sensors = useSensors(
    // A click must never start a drag: every cell here is a target.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange(
      moveRow(
        lines,
        lines.findIndex((l) => l.id === active.id),
        lines.findIndex((l) => l.id === over.id),
      ),
    );
  }

  /** Enter at the end of the last row is the fastest way to keep typing. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    onChange(addRow(lines, index));
    queueMicrotask(() => {
      document.querySelector<HTMLInputElement>(`[data-cell="description-${index + 1}"]`)?.focus();
    });
  }

  return (
    <div>
      <div
        className="grid items-center gap-2 border-b border-line px-1 pb-1.5 text-xs font-bold tracking-wider text-mid uppercase"
        style={{ gridTemplateColumns: columns(showHsn) }}
      >
        <span />
        <span>Description</span>
        {showHsn && <span>HSN/SAC</span>}
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {lines.map((line, index) => (
            <Row
              key={line.id}
              line={line}
              index={index}
              amountMinor={calc.lines[index]?.amountMinor ?? 0}
              currency={currency}
              showHsn={showHsn}
              disabled={disabled}
              onPatch={(patch) => onChange(updateRow(lines, line.id, patch))}
              onRemove={() => onChange(removeRow(lines, line.id))}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onPick={catalog.length > 0 ? () => setPicking(line.id) : undefined}
            />
          ))}
        </SortableContext>
      </DndContext>

      {picking && (
        <CatalogPicker
          items={catalog}
          onClose={() => setPicking(null)}
          onPick={(item) => {
            onChange(
              updateRow(lines, picking, {
                description: item.description,
                hsnSac: item.hsnSac,
                rateMinor: item.rateMinor,
              }),
            );
            setPicking(null);
          }}
        />
      )}

      {!disabled && (
        <button type="button" className="btn field-sm mt-2" onClick={() => onChange(addRow(lines))}>
          <Plus size={14} strokeWidth={2.5} aria-hidden />
          Add line
        </button>
      )}
    </div>
  );
}

const columns = (showHsn: boolean) =>
  showHsn ? "24px 1fr 90px 70px 120px 120px 32px" : "24px 1fr 70px 120px 120px 32px";

function Row({
  line,
  index,
  amountMinor,
  currency,
  showHsn,
  disabled,
  onPatch,
  onRemove,
  onKeyDown,
  onPick,
}: {
  line: InvoiceLine;
  index: number;
  amountMinor: number;
  currency: CurrencyCode;
  showHsn: boolean;
  disabled: boolean;
  onPatch: (patch: Partial<Omit<InvoiceLine, "id">>) => void;
  onRemove: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        gridTemplateColumns: columns(showHsn),
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`grid items-center gap-2 border-b border-line px-1 py-1.5 ${isDragging ? "relative z-10 bg-paper shadow-pop" : ""}`}
    >
      {disabled ? (
        <span />
      ) : (
        // The grip alone drags, not the row: otherwise selecting text in a cell
        // would start a drag. The keyboard sensor makes it work without a mouse.
        <button
          type="button"
          className="cursor-grab touch-none text-placeholder hover:text-body"
          aria-label={`Reorder line ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden />
        </button>
      )}

      <input
        className="field field-sm"
        data-cell={`description-${index}`}
        value={line.description}
        disabled={disabled}
        aria-label={`Line ${index + 1} description`}
        placeholder={onPick ? "What are you billing for?  (/ to pick)" : "What are you billing for?"}
        onChange={(e) => onPatch({ description: e.target.value })}
        onKeyDown={(e) => {
          // "/" only opens the picker on an empty cell, so it stays typeable
          // inside a description like "OTBI / Apex".
          if (e.key === "/" && onPick && line.description === "") {
            e.preventDefault();
            onPick();
            return;
          }
          onKeyDown(e);
        }}
      />

      {showHsn && (
        <input
          className="field field-sm"
          value={line.hsnSac ?? ""}
          disabled={disabled}
          placeholder="998314"
          aria-label={`Line ${index + 1} HSN or SAC code`}
          onChange={(e) => onPatch({ hsnSac: e.target.value.trim() || null })}
          onKeyDown={onKeyDown}
        />
      )}

      <QtyInput
        value={line.qty}
        disabled={disabled}
        label={`Line ${index + 1} quantity`}
        onChange={(qty) => onPatch({ qty })}
        onKeyDown={onKeyDown}
      />

      <MoneyInput
        valueMinor={line.rateMinor}
        currency={currency}
        disabled={disabled}
        aria-label={`Line ${index + 1} rate`}
        onChange={(rateMinor) => onPatch({ rateMinor })}
      />

      {/* Never an input: qty x rate is the arithmetic the old invoices got wrong. */}
      <span className="tnum px-2 text-right text-sm font-semibold">{formatAmount(amountMinor, currency)}</span>

      {disabled ? (
        <span />
      ) : (
        <button
          type="button"
          className="text-placeholder hover:text-red"
          aria-label={`Remove line ${index + 1}`}
          onClick={onRemove}
        >
          <X size={15} strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Quantity, limited to the 3 decimals the database stores. Rejecting at the
 * cell beats letting the server refuse the whole save: otherwise one bad cell
 * parks autosave in an error state and the message appears far from the cause.
 */
function QtyInput({
  value,
  disabled,
  label,
  onChange,
  onKeyDown,
}: {
  value: number;
  disabled: boolean;
  label: string;
  onChange: (qty: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <span className="block">
      <input
        className={`field field-sm tnum w-full text-right ${problem ? "border-red" : ""}`}
        type="number"
        min={0}
        step="0.001"
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (e.target.value === "" || Number.isNaN(next)) {
            setProblem(null);
            onChange(0);
            return;
          }
          if (next < 0) {
            setProblem("Can’t be negative");
            return;
          }
          if (Math.abs(Math.round(next * 1000) - next * 1000) > 1e-6) {
            setProblem("Up to 3 decimals");
            return;
          }
          setProblem(null);
          onChange(next);
        }}
        onKeyDown={onKeyDown}
      />
      {problem && (
        <span role="alert" className="hint block text-right text-red">
          {problem}
        </span>
      )}
    </span>
  );
}

/** Pick a saved line. Opened by "/" in an empty description, or the button. */
function CatalogPicker({
  items,
  onPick,
  onClose,
}: {
  items: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle ? items.filter((i) => i.description.toLowerCase().includes(needle)) : items;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="catalog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      <div className="border-b border-line p-4">
        <h2 id="catalog-title" className="mb-3 font-extrabold">
          Pick a saved line
        </h2>
        <input
          className="field"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalog"
          aria-label="Search the catalog"
        />
      </div>
      <ul className="max-h-[50vh] overflow-y-auto">
        {matches.length === 0 && <li className="p-6 text-center text-sm text-mid">Nothing matches.</li>}
        {matches.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sand"
              onClick={() => onPick(i)}
            >
              <span className="min-w-0 flex-1 truncate">{i.description}</span>
              <span className="tnum shrink-0 text-sm font-semibold">
                {formatAmount(i.rateMinor, i.currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
