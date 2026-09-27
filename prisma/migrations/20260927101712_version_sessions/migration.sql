-- AlterTable
ALTER TABLE "invoice_versions" ADD COLUMN     "change_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "invoice_versions_invoice_id_created_at_idx" ON "invoice_versions"("invoice_id", "created_at" DESC);
