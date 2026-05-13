-- CreateEnum
CREATE TYPE "CommissionMode" AS ENUM ('PROPORTIONAL', 'AFTER_CAPITAL_RECOVERY', 'ADVANCED');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "commissionGenerated" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "commissionLiquidated" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "commissionMode" "CommissionMode",
ADD COLUMN     "commissionPercentage" DECIMAL(7,4),
ADD COLUMN     "commissionProjected" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionMode" "CommissionMode",
ADD COLUMN     "commissionPercentage" DECIMAL(7,4);

-- CreateTable
CREATE TABLE "SellerLiquidation" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerLiquidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerCommissionAudit" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerCommissionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerLiquidation_sellerId_idx" ON "SellerLiquidation"("sellerId");

-- CreateIndex
CREATE INDEX "SellerLiquidation_createdAt_idx" ON "SellerLiquidation"("createdAt");

-- CreateIndex
CREATE INDEX "SellerCommissionAudit_vendorId_idx" ON "SellerCommissionAudit"("vendorId");

-- CreateIndex
CREATE INDEX "SellerCommissionAudit_createdAt_idx" ON "SellerCommissionAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "SellerLiquidation" ADD CONSTRAINT "SellerLiquidation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerLiquidation" ADD CONSTRAINT "SellerLiquidation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionAudit" ADD CONSTRAINT "SellerCommissionAudit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionAudit" ADD CONSTRAINT "SellerCommissionAudit_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
