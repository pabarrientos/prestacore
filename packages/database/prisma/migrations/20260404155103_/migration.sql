/*
  Warnings:

  - You are about to drop the column `initialBalance` on the `Installment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[prestamo_origen_id]` on the table `Loan` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `capitalBalance` to the `Installment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'TARJETA', 'MOVIMIENTO_REFINANCIACION');

-- AlterEnum
ALTER TYPE "InstallmentStatus" ADD VALUE 'CANCELADA_POR_REFINANCIACION';

-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'REFINANCIADO';

-- AlterTable
ALTER TABLE "Installment" DROP COLUMN "initialBalance",
ADD COLUMN     "capitalBalance" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "prestamo_nuevo_id" TEXT,
ADD COLUMN     "prestamo_origen_id" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "method" "PaymentMethod",
ADD COLUMN     "paymentDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_prestamo_origen_id_key" ON "Loan"("prestamo_origen_id");

-- CreateIndex
CREATE INDEX "Loan_prestamo_origen_id_idx" ON "Loan"("prestamo_origen_id");

-- CreateIndex
CREATE INDEX "Loan_prestamo_nuevo_id_idx" ON "Loan"("prestamo_nuevo_id");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_prestamo_origen_id_fkey" FOREIGN KEY ("prestamo_origen_id") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
