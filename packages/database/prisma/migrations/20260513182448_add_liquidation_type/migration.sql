-- CreateEnum
CREATE TYPE "LiquidationType" AS ENUM ('PAYMENT', 'ADVANCE', 'REFUND');

-- AlterTable
ALTER TABLE "SellerLiquidation" ADD COLUMN     "type" "LiquidationType" NOT NULL DEFAULT 'PAYMENT';
