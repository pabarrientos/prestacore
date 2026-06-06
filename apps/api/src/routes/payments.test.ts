import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role, LoanStatus, InstallmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';

const prisma = new PrismaClient();

describe('Payments API — interest-only reversal', () => {
  let adminToken: string;
  let vendorToken: string;
  let testLoanId: string;
  let testClientId: string;
  let testVendorId: string;
  let installmentIds: string[] = [];

  const adminUser = {
    email: `admin-pmtrev-test-${Date.now()}@example.com`,
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'PmtRev',
  };

  const vendorUser = {
    email: `vendor-pmtrev-test-${Date.now()}@example.com`,
    password: 'vendor123',
    firstName: 'Vendor',
    lastName: 'PmtRev',
  };

  const clientUser = {
    email: `client-pmtrev-test-${Date.now()}@example.com`,
    password: 'client123',
    firstName: 'Client',
    lastName: 'PmtRev',
  };

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });

    const admin = await prisma.user.create({
      data: {
        email: adminUser.email,
        passwordHash: await bcrypt.hash(adminUser.password, 10),
        role: Role.ADMIN,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      },
    });

    const vendor = await prisma.user.create({
      data: {
        email: vendorUser.email,
        passwordHash: await bcrypt.hash(vendorUser.password, 10),
        role: Role.VENDEDOR,
        firstName: vendorUser.firstName,
        lastName: vendorUser.lastName,
      },
    });
    testVendorId = vendor.id;

    const client = await prisma.user.create({
      data: {
        email: clientUser.email,
        passwordHash: await bcrypt.hash(clientUser.password, 10),
        role: Role.CLIENTE,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
      },
    });

    const clientProfile = await prisma.client.create({
      data: {
        userId: client.id,
        dni: `PMTREV${Date.now()}`,
        dateOfBirth: new Date('1990-01-01'),
        monthlyIncome: 5000,
      },
    });
    testClientId = clientProfile.id;

    // Loan: $12,000 — 6 monthly installments
    // Each installment: principal $2,000 + interest $100 = $2,100
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        assignedVendorId: testVendorId,
        amount: 12000,
        interestRate: 0.10,
        termMonths: 6,
        frequency: 'MONTHLY',
        status: LoanStatus.ACTIVE,
        amortizationSystem: 'FRENCH',
        totalInterest: 600,
        totalPayment: 12600,
        installmentAmount: 2100,
      },
    });
    testLoanId = loan.id;

    // Create 6 installments with monthly due dates (future dates so they stay PENDING)
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i + 1); // start next month
      const inst = await prisma.installment.create({
        data: {
          loanId: testLoanId,
          installmentNumber: i + 1,
          dueDate,
          amount: 2100,
          principal: 2000,
          interest: 100,
          balance: 2100,
          capitalBalance: 12000 - i * 2000,
          status: InstallmentStatus.PENDING,
          paidAmount: 0,
          moraAmount: 0,
        },
      });
      installmentIds.push(inst.id);
    }

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminRes.body.data.accessToken;

    const vendorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: vendorUser.email, password: vendorUser.password });
    vendorToken = vendorRes.body.data.accessToken;
  });

  afterAll(async () => {
    if (testLoanId) {
      // Delete payments first (they reference installments)
      await prisma.payment.deleteMany({ where: { loanId: testLoanId } });
      await prisma.installment.deleteMany({ where: { loanId: testLoanId } });
      await prisma.loan.deleteMany({ where: { id: testLoanId } });
    }
    await prisma.client.deleteMany({ where: { id: testClientId } });
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });
    await prisma.$disconnect();
  });

  it('should process an interest-only payment and fully reverse it on DELETE', async () => {
    // ── Step 1: snapshot before ──────────────────────────────────────
    const beforeInstallments = await prisma.installment.findMany({
      where: { loanId: testLoanId },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(beforeInstallments).toHaveLength(6);

    const targetInstallment = beforeInstallments[2]; // installment #3
    const targetDueDate = new Date(targetInstallment.dueDate);
    const subsequentDueDatesBefore = beforeInstallments
      .filter((i) => i.dueDate > targetDueDate)
      .map((i) => i.dueDate.toISOString());

    // ── Step 2: make an interest-only payment on installment #3 ──────
    const createRes = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: testLoanId,
        installmentId: targetInstallment.id,
        amount: 100, // interest amount
        paymentDate: new Date().toISOString(),
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const paymentId = createRes.body.data.id;

    // ── Step 3: verify post-payment state ────────────────────────────
    const afterPaymentInst = await prisma.installment.findMany({
      where: { loanId: testLoanId },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });

    // Should now have 7 installments (original 6 + 1 new)
    expect(afterPaymentInst).toHaveLength(7);

    // Find the INTEREST_ONLY installment (original #3, reverted)
    const interestOnlyInst = afterPaymentInst.find(
      (i) => i.status === InstallmentStatus.INTEREST_ONLY,
    );
    expect(interestOnlyInst).toBeDefined();
    expect(interestOnlyInst!.id).toBe(targetInstallment.id); // same record
    expect(Number(interestOnlyInst!.balance)).toBe(0);
    expect(Number(interestOnlyInst!.interestCollected)).toBe(100);

    // Find the "new" installment (replacement for #3, shifted +1 period)
    const newInst = afterPaymentInst.find(
      (i) =>
        i.id !== targetInstallment.id &&
        i.status === InstallmentStatus.PENDING &&
        Number(i.paidAmount) === 0 &&
        Number(i.amount) === Number(targetInstallment.amount) &&
        Number(i.principal) === Number(targetInstallment.principal) &&
        Number(i.interest) === Number(targetInstallment.interest) &&
        new Date(i.dueDate).getTime() > targetDueDate.getTime(),
    );
    expect(newInst).toBeDefined();
    expect(new Date(newInst!.dueDate).getTime()).toBeGreaterThan(targetDueDate.getTime());

    // Subsequent installments should be shifted +1 period
    const afterSubsequent = afterPaymentInst
      .filter((i) => i.dueDate > targetDueDate && i.id !== newInst!.id)
      .map((i) => i.dueDate.toISOString());
    // Each should be ~1 month later than before
    for (let idx = 0; idx < subsequentDueDatesBefore.length; idx++) {
      const before = new Date(subsequentDueDatesBefore[idx]);
      const after = new Date(afterSubsequent[idx]);
      const diffMonths =
        (after.getFullYear() - before.getFullYear()) * 12 +
        (after.getMonth() - before.getMonth());
      expect(diffMonths).toBeGreaterThanOrEqual(1);
    }

    // ── Step 4: DELETE the interest-only payment ─────────────────────
    const deleteRes = await request(app)
      .delete(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // ── Step 5: verify full reversal ─────────────────────────────────
    const afterDeleteInst = await prisma.installment.findMany({
      where: { loanId: testLoanId },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });

    // Should be back to 6 installments
    expect(afterDeleteInst).toHaveLength(6);

    // No INTEREST_ONLY installment should remain
    const remainingInterestOnly = afterDeleteInst.find(
      (i) => i.status === InstallmentStatus.INTEREST_ONLY,
    );
    expect(remainingInterestOnly).toBeUndefined();

    // The original installment should be PENDING again with full balance
    const restoredInst = afterDeleteInst.find((i) => i.id === targetInstallment.id);
    expect(restoredInst).toBeDefined();
    expect(restoredInst!.status).toBe(InstallmentStatus.PENDING);
    expect(Number(restoredInst!.balance)).toBe(2100);
    expect(Number(restoredInst!.paidAmount)).toBe(0);
    expect(Number(restoredInst!.interestCollected)).toBe(0);

    // The "new" installment should be gone
    const deletedInst = afterDeleteInst.find((i) => i.id === newInst!.id);
    expect(deletedInst).toBeUndefined();

    // Subsequent installments should be back to their original due dates
    const afterDeleteSubsequent = afterDeleteInst
      .filter((i) => i.dueDate > targetDueDate)
      .map((i) => i.dueDate.toISOString());
    expect(afterDeleteSubsequent).toEqual(subsequentDueDatesBefore);

    // Installment numbers should be sequential 1..6
    const numbers = afterDeleteInst.map((i) => i.installmentNumber);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);

    // Capital balances should be correct: running from $12,000 decreasing by $2,000 each
    for (let i = 0; i < afterDeleteInst.length; i++) {
      expect(Number(afterDeleteInst[i].capitalBalance)).toBe(12000 - (i + 1) * 2000);
    }
  });

  it('should refuse to reverse interest-only payment when generated installment has payments', async () => {
    // Create a SECOND loan so this test doesn't interfere with the previous one
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        assignedVendorId: testVendorId,
        amount: 6000,
        interestRate: 0.10,
        termMonths: 3,
        frequency: 'MONTHLY',
        status: LoanStatus.ACTIVE,
        amortizationSystem: 'FRENCH',
        totalInterest: 300,
        totalPayment: 6300,
        installmentAmount: 2100,
      },
    });

    const today = new Date();
    const instIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      const inst = await prisma.installment.create({
        data: {
          loanId: loan.id,
          installmentNumber: i + 1,
          dueDate,
          amount: 2100,
          principal: 2000,
          interest: 100,
          balance: 2100,
          capitalBalance: 6000 - i * 2000,
          status: InstallmentStatus.PENDING,
          paidAmount: 0,
          moraAmount: 0,
        },
      });
      instIds.push(inst.id);
    }

    // Make interest-only payment on installment #1
    const createRes = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: instIds[0],
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(createRes.status).toBe(201);
    const interestOnlyPaymentId = createRes.body.data.id;

    // Find the generated "new" installment and register a payment on it
    const installmentsAfter = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    const newInst = installmentsAfter.find(
      (i) =>
        i.id !== instIds[0] &&
        i.status === InstallmentStatus.PENDING &&
        Number(i.paidAmount) === 0 &&
        Number(i.amount) === 2100 &&
        new Date(i.dueDate).getTime() > new Date(installmentsAfter[0].dueDate).getTime(),
    );
    expect(newInst).toBeDefined();

    // Register a normal payment on the generated installment
    const normalPaymentRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: newInst!.id,
        amount: 500,
        paymentDate: new Date().toISOString(),
      });
    expect(normalPaymentRes.status).toBe(201);

    // Now try to delete the interest-only payment — should fail
    const deleteRes = await request(app)
      .delete(`/api/payments/${interestOnlyPaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.success).toBe(false);
    expect(deleteRes.body.error).toContain('ya tiene pagos registrados');

    // Clean up: delete payments and installments for this secondary loan
    await prisma.payment.deleteMany({ where: { loanId: loan.id } });
    await prisma.installment.deleteMany({ where: { loanId: loan.id } });
    await prisma.loan.deleteMany({ where: { id: loan.id } });
  });

  it('should reverse the correct interest-only payment when there are multiple on the same loan', async () => {
    // Create a third loan with 4 installments
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        assignedVendorId: testVendorId,
        amount: 8000,
        interestRate: 0.10,
        termMonths: 4,
        frequency: 'MONTHLY',
        status: LoanStatus.ACTIVE,
        amortizationSystem: 'FRENCH',
        totalInterest: 400,
        totalPayment: 8400,
        installmentAmount: 2100,
      },
    });

    const today = new Date();
    const instIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      const inst = await prisma.installment.create({
        data: {
          loanId: loan.id,
          installmentNumber: i + 1,
          dueDate,
          amount: 2100,
          principal: 2000,
          interest: 100,
          balance: 2100,
          capitalBalance: 8000 - i * 2000,
          status: InstallmentStatus.PENDING,
          paidAmount: 0,
          moraAmount: 0,
        },
      });
      instIds.push(inst.id);
    }

    // --- make two interest-only payments: on installment #1 and #3 ---
    // (using non-adjacent installments to avoid renumbering interference)
    const iopay1Res = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: instIds[0], // installment #1
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(iopay1Res.status).toBe(201);
    const ioPayment1Id = iopay1Res.body.data.id;

    // After first interest-only, find the installment that was originally #3
    // (its installmentNumber may have shifted due to renumbering)
    const afterFirst = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterFirst).toHaveLength(5); // 4 + 1 new

    // The original installment #3 (instIds[2]) still exists with same dueDate
    const originalThirdInst = afterFirst.find((i) => i.id === instIds[2]);
    expect(originalThirdInst).toBeDefined();

    const iopay3Res = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: instIds[2], // original installment #3
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(iopay3Res.status).toBe(201);
    const ioPayment3Id = iopay3Res.body.data.id;

    // After 2 interest-only payments we should have 6 installments (4 + 2)
    const afterBoth = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterBoth).toHaveLength(6);

    // Verify both INTEREST_ONLY installments still exist
    const interestOnlyInsts = afterBoth.filter(
      (i) => i.status === InstallmentStatus.INTEREST_ONLY,
    );
    expect(interestOnlyInsts).toHaveLength(2);

    // --- delete the interest-only payment for the original installment #1 ---
    const deleteRes = await request(app)
      .delete(`/api/payments/${ioPayment1Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // --- verify: only the first interest-only payment was reversed ---
    const afterDeleteOne = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });

    // Total after reversing one: should be 5 installments (6 - 1 new)
    expect(afterDeleteOne).toHaveLength(5);

    // Only one INTEREST_ONLY should remain — the one for original installment #3
    const remainingIO = afterDeleteOne.filter(
      (i) => i.status === InstallmentStatus.INTEREST_ONLY,
    );
    expect(remainingIO).toHaveLength(1);
    expect(remainingIO[0].id).toBe(instIds[2]);

    // Original installment #1 should be PENDING again, with full balance, no interestCollected
    const restoredInst = afterDeleteOne.find(
      (i) => i.id === instIds[0],
    );
    expect(restoredInst).toBeDefined();
    expect(restoredInst!.status).toBe(InstallmentStatus.PENDING);
    expect(Number(restoredInst!.balance)).toBe(2100);
    expect(Number(restoredInst!.paidAmount)).toBe(0);
    expect(Number(restoredInst!.interestCollected)).toBe(0);

    // Original installment #3 should still be INTEREST_ONLY with correct interestCollected
    const stillIO = afterDeleteOne.find((i) => i.id === instIds[2]);
    expect(stillIO).toBeDefined();
    expect(stillIO!.status).toBe(InstallmentStatus.INTEREST_ONLY);
    expect(Number(stillIO!.interestCollected)).toBe(100);

    // Installment numbers should be sequential 1..5
    const numbers = afterDeleteOne.map((i) => i.installmentNumber);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);

    // --- delete the remaining interest-only payment for original installment #3 ---
    const deleteRes3 = await request(app)
      .delete(`/api/payments/${ioPayment3Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes3.status).toBe(200);

    // --- verify: everything is back to 4 installments, all PENDING ---
    const afterDeleteBoth = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterDeleteBoth).toHaveLength(4);

    const noIO = afterDeleteBoth.filter(
      (i) => i.status !== InstallmentStatus.PENDING,
    );
    expect(noIO).toHaveLength(0);

    const numbersFinal = afterDeleteBoth.map((i) => i.installmentNumber);
    expect(numbersFinal).toEqual([1, 2, 3, 4]);

    // Clean up
    await prisma.payment.deleteMany({ where: { loanId: loan.id } });
    await prisma.installment.deleteMany({ where: { loanId: loan.id } });
    await prisma.loan.deleteMany({ where: { id: loan.id } });
  });

  it('should handle chained interest-only payments and enforce deletion order', async () => {
    // Create a loan with 3 installments
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        assignedVendorId: testVendorId,
        amount: 6000,
        interestRate: 0.10,
        termMonths: 3,
        frequency: 'MONTHLY',
        status: LoanStatus.ACTIVE,
        amortizationSystem: 'FRENCH',
        totalInterest: 300,
        totalPayment: 6300,
        installmentAmount: 2100,
      },
    });

    const today = new Date();
    const instIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      const inst = await prisma.installment.create({
        data: {
          loanId: loan.id,
          installmentNumber: i + 1,
          dueDate,
          amount: 2100,
          principal: 2000,
          interest: 100,
          balance: 2100,
          capitalBalance: 6000 - i * 2000,
          status: InstallmentStatus.PENDING,
          paidAmount: 0,
          moraAmount: 0,
        },
      });
      instIds.push(inst.id);
    }

    // Pay installment #1 normally
    const pay1Res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: instIds[0],
        amount: 2100,
        paymentDate: new Date().toISOString(),
      });
    expect(pay1Res.status).toBe(201);

    // Chain 1: Interest-only on installment #2 → creates installment #3
    const io1Res = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: instIds[1], // original installment #2
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(io1Res.status).toBe(201);
    const io1PaymentId = io1Res.body.data.id;

    // Find the generated installment #3
    const afterIO1 = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterIO1).toHaveLength(4); // 3 original + 1 generated

    // The generated installment has the same amount/principal/interest as original #2
    const originalInst2 = await prisma.installment.findUnique({ where: { id: instIds[1] } });
    const generatedInst3 = afterIO1.find(
      (i) =>
        i.status === InstallmentStatus.PENDING &&
        Number(i.amount) === Number(originalInst2!.amount) &&
        Number(i.principal) === Number(originalInst2!.principal) &&
        Number(i.interest) === Number(originalInst2!.interest) &&
        new Date(i.dueDate) > new Date(originalInst2!.dueDate),
    );
    expect(generatedInst3).toBeDefined();

    // Chain 2: Interest-only on the generated installment #3 → creates installment #4
    const io2Res = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: generatedInst3!.id,
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(io2Res.status).toBe(201);
    const io2PaymentId = io2Res.body.data.id;

    // Find the generated installment #4
    const afterIO2 = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterIO2).toHaveLength(5); // 3 original + 2 generated

    // The generated installment #4 has the same amount/principal/interest as generatedInst3
    const generatedInst4 = afterIO2.find(
      (i) =>
        i.status === InstallmentStatus.PENDING &&
        Number(i.amount) === Number(generatedInst3!.amount) &&
        Number(i.principal) === Number(generatedInst3!.principal) &&
        Number(i.interest) === Number(generatedInst3!.interest) &&
        new Date(i.dueDate) > new Date(generatedInst3!.dueDate),
    );
    expect(generatedInst4).toBeDefined();

    // Chain 3: Interest-only on the generated installment #4 → creates installment #5
    const io3Res = await request(app)
      .post('/api/payments/interest-only')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        loanId: loan.id,
        installmentId: generatedInst4!.id,
        amount: 100,
        paymentDate: new Date().toISOString(),
      });
    expect(io3Res.status).toBe(201);
    const io3PaymentId = io3Res.body.data.id;

    // Verify final state: 6 installments (3 original + 3 generated)
    const finalState = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(finalState).toHaveLength(6);
    expect(finalState[0].status).toBe(InstallmentStatus.PAID); // #1 paid normally
    expect(finalState[1].status).toBe(InstallmentStatus.INTEREST_ONLY); // #2 interest-only
    expect(finalState[2].status).toBe(InstallmentStatus.INTEREST_ONLY); // #3 interest-only
    expect(finalState[3].status).toBe(InstallmentStatus.INTEREST_ONLY); // #4 interest-only
    expect(finalState[4].status).toBe(InstallmentStatus.PENDING); // #5 generated, not paid

    // --- Try to delete io1 (first payment) → should fail because its generated installment was used ---
    const deleteIO1Res = await request(app)
      .delete(`/api/payments/${io1PaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteIO1Res.status).toBe(400);
    expect(deleteIO1Res.body.error).toContain('ya fue usada para otro pago de solo interés');

    // --- Try to delete io2 (second payment) → should fail for the same reason ---
    const deleteIO2Res = await request(app)
      .delete(`/api/payments/${io2PaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteIO2Res.status).toBe(400);
    expect(deleteIO2Res.body.error).toContain('ya fue usada para otro pago de solo interés');

    // --- Delete io3 (last payment) → should succeed ---
    const deleteIO3Res = await request(app)
      .delete(`/api/payments/${io3PaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteIO3Res.status).toBe(200);

    // After deleting io3, should have 5 installments
    const afterDeleteIO3 = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterDeleteIO3).toHaveLength(5);
    // generatedInst4 should now be PENDING (restored from INTEREST_ONLY)
    const restoredInst4 = afterDeleteIO3.find((i) => i.id === generatedInst4!.id);
    expect(restoredInst4).toBeDefined();
    expect(restoredInst4!.status).toBe(InstallmentStatus.PENDING);

    // --- Now delete io2 (second payment) → should succeed ---
    const deleteIO2NowRes = await request(app)
      .delete(`/api/payments/${io2PaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteIO2NowRes.status).toBe(200);

    // After deleting io2, should have 4 installments
    const afterDeleteIO2 = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(afterDeleteIO2).toHaveLength(4);

    // --- Now delete io1 (first payment) → should succeed ---
    const deleteIO1NowRes = await request(app)
      .delete(`/api/payments/${io1PaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteIO1NowRes.status).toBe(200);

    // Final verification: should be back to 3 installments
    const finalAfterAllDeletes = await prisma.installment.findMany({
      where: { loanId: loan.id },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    expect(finalAfterAllDeletes).toHaveLength(3);

    // Verify these are the ORIGINAL 3 installments (by ID)
    const finalIds = finalAfterAllDeletes.map(i => i.id).sort();
    const originalIds = instIds.sort();
    expect(finalIds).toEqual(originalIds);

    // Verify installment numbers are back to 1, 2, 3
    expect(finalAfterAllDeletes[0].installmentNumber).toBe(1);
    expect(finalAfterAllDeletes[1].installmentNumber).toBe(2);
    expect(finalAfterAllDeletes[2].installmentNumber).toBe(3);

    // Verify due dates are back to original values
    const origInst1Final = await prisma.installment.findUnique({ where: { id: instIds[0] } });
    const origInst2Final = await prisma.installment.findUnique({ where: { id: instIds[1] } });
    const origInst3Final = await prisma.installment.findUnique({ where: { id: instIds[2] } });

    expect(finalAfterAllDeletes[0].dueDate.toISOString()).toBe(origInst1Final!.dueDate.toISOString());
    expect(finalAfterAllDeletes[1].dueDate.toISOString()).toBe(origInst2Final!.dueDate.toISOString());
    expect(finalAfterAllDeletes[2].dueDate.toISOString()).toBe(origInst3Final!.dueDate.toISOString());

    // Verify amounts are unchanged
    expect(Number(finalAfterAllDeletes[0].amount)).toBe(2100);
    expect(Number(finalAfterAllDeletes[1].amount)).toBe(2100);
    expect(Number(finalAfterAllDeletes[2].amount)).toBe(2100);

    // Verify status: cuota 1 stays PAID (normal payment), cuotas 2 y 3 back to PENDING
    expect(finalAfterAllDeletes[0].status).toBe(InstallmentStatus.PAID);
    expect(finalAfterAllDeletes[1].status).toBe(InstallmentStatus.PENDING);
    expect(finalAfterAllDeletes[2].status).toBe(InstallmentStatus.PENDING);

    // Verify cuota 2 and 3 have no interest collected (fully reversed)
    expect(Number(finalAfterAllDeletes[1].interestCollected)).toBe(0);
    expect(Number(finalAfterAllDeletes[2].interestCollected)).toBe(0);

    // Clean up
    await prisma.payment.deleteMany({ where: { loanId: loan.id } });
    await prisma.installment.deleteMany({ where: { loanId: loan.id } });
    await prisma.loan.deleteMany({ where: { id: loan.id } });
  });
});

