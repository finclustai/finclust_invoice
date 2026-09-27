/**
 * The invoice layouts. One component draws all of them; a template only says
 * how dense the page is and where the title sits, so nothing about the
 * *content* of an invoice can differ between them.
 */
export interface TemplateLayout {
  /** Title and number across the top, company beneath, rather than a right column. */
  centredTitle: boolean;
  /** Overrides merged onto the page's own style. */
  page: { fontSize?: number; paddingTop?: number; paddingHorizontal?: number };
  hairlines: boolean;
}

export const TEMPLATES = {
  classic: { centredTitle: false, page: {}, hairlines: false },
  centred: { centredTitle: true, page: { paddingTop: 36 }, hairlines: false },
  // Smaller type and tighter margins, for an invoice with many lines.
  compact: { centredTitle: false, page: { fontSize: 8, paddingTop: 32, paddingHorizontal: 36 }, hairlines: true },
  minimal: { centredTitle: true, page: { fontSize: 8.5, paddingTop: 44 }, hairlines: true },
} satisfies Record<string, TemplateLayout>;

/** Falls back rather than failing: an unknown template must still print. */
export function layoutFor(template: string): TemplateLayout {
  return TEMPLATES[template as keyof typeof TEMPLATES] ?? TEMPLATES.classic;
}

export const TEMPLATE_CHOICES: { id: string; name: string; description: string }[] = [
  { id: "classic", name: "Classic", description: "Your usual layout — company left, invoice details right" },
  { id: "centred", name: "Centred", description: "Invoice title and number across the top, company beneath" },
  { id: "compact", name: "Compact", description: "Smaller type and tighter margins, for long invoices" },
  { id: "minimal", name: "Minimal", description: "Centred and stripped back, hairline rules only" },
];
