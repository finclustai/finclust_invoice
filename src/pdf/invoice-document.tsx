import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatAmount, formatMoneyWithCode } from "@/domain/money/currency";
import type { InvoiceDocumentProps } from "./props";

/*
 * Classic: the layout FINCLUST already sends, tightened up. Helvetica is a
 * standard PDF font needing no embedding, and the originals were rendered by
 * Google Docs in Arial, so this is faithful rather than a compromise.
 * ponytail: no embedded brand font. Register TTFs here if that is ever wanted.
 */
const INK = "#15140f";
const BODY = "#4a463d";
const MID = "#6b665c";
const LINE = "#e0dacb";
const SAND = "#f6f2e8";
const ORANGE = "#ff8a1e";

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9, color: BODY, fontFamily: "Helvetica" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sellerName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4, maxWidth: 260 },
  sellerLine: { fontSize: 8.5, color: MID, marginBottom: 1.5, maxWidth: 260 },

  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right", letterSpacing: -0.5 },
  number: { fontSize: 10, fontFamily: "Helvetica-Bold", color: MID, textAlign: "right", marginTop: 2 },

  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  metaLabel: { fontSize: 7.5, color: MID, letterSpacing: 0.8, textAlign: "right" },
  metaValue: { fontSize: 9.5, color: INK, textAlign: "right", marginTop: 1.5 },

  dueBox: { marginTop: 10, backgroundColor: SAND, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 11, alignSelf: "flex-end", minWidth: 165 },
  dueLabel: { fontSize: 7.5, color: MID, letterSpacing: 0.8, textAlign: "right" },
  dueValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right", marginTop: 2 },

  billTo: { marginTop: 26 },
  sectionLabel: { fontSize: 7.5, color: MID, letterSpacing: 0.8, marginBottom: 5 },
  customerName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 2 },
  customerLine: { fontSize: 8.5, color: BODY, marginBottom: 1.5 },

  table: { marginTop: 22 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5 },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 7 },
  td: { fontSize: 9, color: BODY },

  colDesc: { flex: 1, paddingRight: 10 },
  colHsn: { width: 56 },
  colRate: { width: 78, textAlign: "right" },
  colQty: { width: 40, textAlign: "right" },
  colAmount: { width: 88, textAlign: "right" },

  totals: { marginTop: 12, alignSelf: "flex-end", minWidth: 245 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 },
  totalLabel: { fontSize: 9, color: BODY },
  totalValue: { fontSize: 9, color: INK, textAlign: "right" },
  grandRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 7, borderTopWidth: 1, borderTopColor: INK },
  grandLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  grandValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right" },

  words: { marginTop: 16, fontSize: 8.5, color: BODY },
  wordsLabel: { fontFamily: "Helvetica-Bold", color: INK },

  note: { marginTop: 14, fontSize: 8.5, color: BODY, lineHeight: 1.45 },
  lut: { marginTop: 14, fontSize: 8, color: MID, fontFamily: "Helvetica-Oblique", lineHeight: 1.45 },

  payment: { marginTop: 26, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 12 },
  payName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3 },
  payLine: { fontSize: 8.5, color: BODY, marginBottom: 1.5 },

  draft: {
    position: "absolute", top: 300, left: 0, right: 0, textAlign: "center",
    fontSize: 88, fontFamily: "Helvetica-Bold", color: ORANGE, opacity: 0.13, letterSpacing: 10,
  },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, fontSize: 7.5, color: MID, textAlign: "center" },
});

export function InvoiceDocument({ doc }: { doc: InvoiceDocumentProps }) {
  const { seller, customer, calc, currency } = doc;
  const amount = (minor: number) => formatAmount(minor, currency);
  const bank = [
    seller.bankAccount && `Account No.: ${seller.bankAccount}`,
    seller.bankIfsc && `IFSC Code: ${seller.bankIfsc}`,
    seller.bankName,
    seller.bankBranch,
  ].filter(Boolean) as string[];

  return (
    <Document title={doc.number} author={seller.name}>
      <Page size="A4" style={s.page}>
        {doc.isDraft && <Text style={s.draft} fixed>DRAFT</Text>}

        <View style={s.header}>
          <View>
            <Text style={s.sellerName}>{seller.name}</Text>
            {seller.addressLines.map((l, i) => (
              <Text key={i} style={s.sellerLine}>{l}</Text>
            ))}
            {seller.email && <Text style={s.sellerLine}>{seller.email}</Text>}
            {seller.phone && <Text style={s.sellerLine}>{seller.phone}</Text>}
            {seller.gstin && <Text style={s.sellerLine}>GST: {seller.gstin}</Text>}
            {seller.lut && <Text style={s.sellerLine}>LUT: {seller.lut}</Text>}
          </View>

          <View>
            <Text style={s.title}>Invoice</Text>
            <Text style={s.number}>{doc.number}</Text>
            <View style={s.metaRow}>
              <View>
                <Text style={s.metaLabel}>DATE</Text>
                <Text style={s.metaValue}>{doc.issueDateLabel}</Text>
              </View>
            </View>
            {doc.dueDateLabel && (
              <View style={s.metaRow}>
                <View>
                  <Text style={s.metaLabel}>DUE</Text>
                  <Text style={s.metaValue}>{doc.dueDateLabel}</Text>
                </View>
              </View>
            )}
            {doc.paymentTerms && (
              <View style={s.metaRow}>
                <View>
                  <Text style={s.metaLabel}>TERMS</Text>
                  <Text style={s.metaValue}>{doc.paymentTerms}</Text>
                </View>
              </View>
            )}
            <View style={s.dueBox}>
              <Text style={s.dueLabel}>BALANCE DUE</Text>
              <Text style={s.dueValue}>{formatMoneyWithCode(calc.totalMinor, currency)}</Text>
            </View>
          </View>
        </View>

        <View style={s.billTo}>
          <Text style={s.sectionLabel}>BILL TO</Text>
          <Text style={s.customerName}>{customer.name}</Text>
          {customer.addressLines.map((l, i) => (
            <Text key={i} style={s.customerLine}>{l}</Text>
          ))}
          {customer.gstin && <Text style={s.customerLine}>GST: {customer.gstin}</Text>}
          {customer.emails[0] && <Text style={s.customerLine}>{customer.emails[0]}</Text>}
        </View>

        <View style={s.table}>
          <View style={s.thead} fixed>
            <Text style={[s.th, s.colDesc]}>DESCRIPTION</Text>
            {doc.showHsnColumn && <Text style={[s.th, s.colHsn]}>HSN/SAC</Text>}
            <Text style={[s.th, s.colRate]}>RATE</Text>
            <Text style={[s.th, s.colQty]}>QTY</Text>
            <Text style={[s.th, s.colAmount]}>AMOUNT</Text>
          </View>
          {calc.lines.map((l) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={[s.td, s.colDesc]}>{l.description}</Text>
              {doc.showHsnColumn && <Text style={[s.td, s.colHsn]}>{l.hsnSac ?? ""}</Text>}
              <Text style={[s.td, s.colRate]}>{amount(l.rateMinor)}</Text>
              <Text style={[s.td, s.colQty]}>{l.qty}</Text>
              <Text style={[s.td, s.colAmount]}>{amount(l.amountMinor)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{amount(calc.subtotalMinor)}</Text>
          </View>
          {calc.taxes.map((t) => (
            <View key={t.label} style={s.totalRow}>
              <Text style={s.totalLabel}>
                {t.label} @ {t.rateBp / 100}%
              </Text>
              <Text style={s.totalValue}>{amount(t.amountMinor)}</Text>
            </View>
          ))}
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>BALANCE DUE</Text>
            <Text style={s.grandValue}>{formatMoneyWithCode(calc.totalMinor, currency)}</Text>
          </View>
        </View>

        <Text style={s.words}>
          <Text style={s.wordsLabel}>Amount in words: </Text>
          {calc.totalInWords}
        </Text>

        {doc.showLut && (
          <Text style={s.lut}>
            Supply meant for export under LUT without payment of IGST
            {seller.lut ? ` (LUT: ${seller.lut})` : ""}.
          </Text>
        )}

        {doc.notes && <Text style={s.note}>{doc.notes}</Text>}

        {bank.length > 0 && (
          <View style={s.payment} wrap={false}>
            <Text style={s.sectionLabel}>PAYMENT INFORMATION</Text>
            <Text style={s.payName}>{seller.name}</Text>
            {bank.map((l, i) => (
              <Text key={i} style={s.payLine}>{l}</Text>
            ))}
          </View>
        )}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${doc.number} · Page ${pageNumber} of ${totalPages}` : doc.number
          }
        />
      </Page>
    </Document>
  );
}
