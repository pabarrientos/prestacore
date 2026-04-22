-- CreateEnum
CREATE TYPE "AmortizationSystemType" AS ENUM ('FRENCH', 'GERMAN', 'FLAT_RATE');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "amortizationSystem" "AmortizationSystemType" NOT NULL DEFAULT 'FRENCH';
