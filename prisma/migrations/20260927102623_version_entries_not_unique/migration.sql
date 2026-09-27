-- DropIndex
DROP INDEX "invoice_versions_invoice_id_version_key";

-- CreateIndex
CREATE INDEX "invoice_versions_invoice_id_version_idx" ON "invoice_versions"("invoice_id", "version");
