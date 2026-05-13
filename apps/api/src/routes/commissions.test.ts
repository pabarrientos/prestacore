import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role, CommissionMode, LoanStatus, InstallmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';
import { CommissionService } from '../services/commission';

const prisma = new PrismaClient();

describe('Commissions API', () => {
  // Test users
  const adminUser = {
    email: `admin-commission-${Date.now()}@example.com`,
    password: 'admin123456',
    firstName: 'Admin',
    lastName: 'User',
  };

  const vendorUser = {
    email: `vendor-commission-${Date.now()}@example.com`,
    password: 'vendor123456',
    firstName: 'Vendor',
    lastName: 'User',
  };

  let adminToken: string;
  let vendorToken: string;
  let vendorId: string;

  beforeAll(async () => {
    // Clean up test users
    await prisma.user.deleteMany({
      where: { email: adminUser.email },
    });
    await prisma.user.deleteMany({
      where: { email: vendorUser.email },
    });

    // Create admin directly via Prisma
    await prisma.user.create({
      data: {
        email: adminUser.email,
        passwordHash: await bcrypt.hash(adminUser.password, 10),
        role: Role.ADMIN,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      },
    });

    // Create vendor via registration
    const vendorResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: vendorUser.email,
        password: vendorUser.password,
        firstName: vendorUser.firstName,
        lastName: vendorUser.lastName,
        role: 'VENDEDOR',
      });
    
    if (!vendorResponse.body.success) {
      throw new Error(`Vendor registration failed: ${vendorResponse.body.error}`);
    }
    vendorToken = vendorResponse.body.data.accessToken;
    vendorId = vendorResponse.body.data.user.id;

    // Get admin token via login
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminLoginRes.body.data.accessToken;

    // Set commission config for vendor
    const configResponse = await request(app)
      .post('/api/commissions/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        vendorId,
        percentage: 5,
        mode: 'PROPORTIONAL',
      });
    
    if (!configResponse.body.success) {
      throw new Error(`Config setup failed: ${configResponse.body.error}`);
    }
  });

  afterAll(async () => {
    // Clean up in correct order (FK constraints on SellerCommissionAudit: vendorId AND changedBy)
    // First get user IDs
    const adminUserRecord = await prisma.user.findUnique({ where: { email: adminUser.email } });
    const vendorUserRecord = await prisma.user.findUnique({ where: { email: vendorUser.email } });
    
    // Delete all audit records where this user was the changer or vendor
    if (adminUserRecord) {
      await prisma.sellerCommissionAudit.deleteMany({
        where: { OR: [{ vendorId: adminUserRecord.id }, { changedBy: adminUserRecord.id }] },
      });
    }
    if (vendorUserRecord) {
      await prisma.sellerCommissionAudit.deleteMany({
        where: { OR: [{ vendorId: vendorUserRecord.id }, { changedBy: vendorUserRecord.id }] },
      });
    }
    
    // Delete liquidations
    await prisma.sellerLiquidation.deleteMany({
      where: { sellerId: vendorId },
    });
    
    // Now delete users
    await prisma.user.deleteMany({ where: { email: adminUser.email } });
    await prisma.user.deleteMany({ where: { email: vendorUser.email } });
    await prisma.$disconnect();
  });

  describe('POST /api/commissions/config', () => {
    it('should set commission config as ADMIN', async () => {
      // Create a new vendor for this test
      const newVendorEmail = `newvendor-${Date.now()}@example.com`;
      const newVendorResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: newVendorEmail,
          password: 'vendor123456',
          firstName: 'New',
          lastName: 'Vendor',
          role: Role.VENDEDOR,
        });

      const res = await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId: newVendorResponse.body.data.user.id,
          percentage: 10,
          mode: 'AFTER_CAPITAL_RECOVERY',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.percentage).toBe(10);
      expect(res.body.data.mode).toBe('AFTER_CAPITAL_RECOVERY');

      // Clean up - delete audit records first (FK)
      const newVendorId = newVendorResponse.body.data.user.id;
      await prisma.sellerCommissionAudit.deleteMany({
        where: { OR: [{ vendorId: newVendorId }, { changedBy: newVendorId }] },
      });
      await prisma.user.deleteMany({ where: { email: newVendorEmail } });
    });

    it('should reject invalid percentage ( > 100)', async () => {
      const res = await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId,
          percentage: 120,
          mode: 'PROPORTIONAL',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid percentage ( < 0)', async () => {
      const res = await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId,
          percentage: -5,
          mode: 'PROPORTIONAL',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject setting config for non-VENDEDOR user', async () => {
      // Create a CLIENTE user
      const clienteEmail = `cliente-${Date.now()}@example.com`;
      const clienteResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: clienteEmail,
          password: 'client123456',
          firstName: 'Cliente',
          lastName: 'Test',
          role: 'CLIENTE',
        });
      
      const clienteId = clienteResponse.body.data.user.id;

      const res = await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId: clienteId,
          percentage: 5,
          mode: 'PROPORTIONAL',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      
      // Clean up
      await prisma.user.deleteMany({ where: { email: clienteEmail } });
    });

    it('should reject VENDEDOR trying to set config', async () => {
      const res = await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          vendorId,
          percentage: 5,
          mode: 'PROPORTIONAL',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should create audit entries when setting config', async () => {
      // Create a new vendor for this test
      const newVendorEmail = `auditvendor-${Date.now()}@example.com`;
      const newVendorResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: newVendorEmail,
          password: 'vendor123456',
          firstName: 'Audit',
          lastName: 'Vendor',
          role: Role.VENDEDOR,
        });

      await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId: newVendorResponse.body.data.user.id,
          percentage: 7,
          mode: 'ADVANCED',
        });

      const audits = await prisma.sellerCommissionAudit.findMany({
        where: { vendorId: newVendorResponse.body.data.user.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(audits.length).toBe(2);
      expect(audits.some(a => a.field === 'commissionPercentage')).toBe(true);
      expect(audits.some(a => a.field === 'commissionMode')).toBe(true);

      // Clean up - delete audit records first (FK: both vendorId and changedBy)
      const newVendorId = newVendorResponse.body.data.user.id;
      await prisma.sellerCommissionAudit.deleteMany({
        where: { OR: [{ vendorId: newVendorId }, { changedBy: newVendorId }] },
      });
      await prisma.user.deleteMany({ where: { email: newVendorEmail } });
    });
  });

  describe('PUT /api/commissions/config/:vendorId', () => {
    it('should update commission percentage', async () => {
      const res = await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ percentage: 8 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.percentage).toBe(8);
    });

    it('should update commission mode', async () => {
      const res = await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mode: 'ADVANCED' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('ADVANCED');
    });

    it('should create audit entry on update', async () => {
      const beforeCount = await prisma.sellerCommissionAudit.count({
        where: { vendorId },
      });

      await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ percentage: 12 });

      const afterCount = await prisma.sellerCommissionAudit.count({
        where: { vendorId },
      });

      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    it('should reject VENDEDOR trying to update config', async () => {
      const res = await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ percentage: 15 })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject empty update', async () => {
      const res = await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/commissions/vendor/:vendorId', () => {
    it('should get vendor commission summary as ADMIN', async () => {
      const res = await request(app)
        .get(`/api/commissions/vendor/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.vendor).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.totalGenerated).toBeDefined();
      expect(res.body.data.summary.totalLiquidated).toBeDefined();
      expect(res.body.data.summary.pending).toBeDefined();
    });

    it('should get own commission summary as VENDEDOR', async () => {
      const res = await request(app)
        .get(`/api/commissions/vendor/${vendorId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.vendor.id).toBe(vendorId);
    });

    it('should reject VENDEDOR viewing other vendor', async () => {
      // Create another vendor
      const otherVendorEmail = `othervendor-${Date.now()}@example.com`;
      const otherResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: otherVendorEmail,
          password: 'vendor123456',
          firstName: 'Other',
          lastName: 'Vendor',
          role: Role.VENDEDOR,
        });

      const res = await request(app)
        .get(`/api/commissions/vendor/${otherResponse.body.data.user.id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);

      // Clean up
      await prisma.user.deleteMany({ where: { email: otherVendorEmail } });
    });
  });

  describe('POST /api/commissions/liquidate', () => {
    it('should reject liquidation exceeding pending commissions', async () => {
      const res = await request(app)
        .post('/api/commissions/liquidate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId,
          amount: 999999,
          notes: 'Too much',
        })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Insufficient');
    });

    it('should reject zero liquidation', async () => {
      const res = await request(app)
        .post('/api/commissions/liquidate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorId,
          amount: 0,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject VENDEDOR trying to liquidate', async () => {
      const res = await request(app)
        .post('/api/commissions/liquidate')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          vendorId,
          amount: 100,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/commissions/audit/:vendorId', () => {
    it('should get audit history as ADMIN', async () => {
      const res = await request(app)
        .get(`/api/commissions/audit/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject VENDEDOR viewing audit', async () => {
      const res = await request(app)
        .get(`/api/commissions/audit/${vendorId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should return audits ordered by createdAt desc', async () => {
      // First do an update to create a new audit entry
      await request(app)
        .put(`/api/commissions/config/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ percentage: 15 });

      const res = await request(app)
        .get(`/api/commissions/audit/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const audits = res.body.data;
      for (let i = 1; i < audits.length; i++) {
        const prev = new Date(audits[i - 1].createdAt);
        const curr = new Date(audits[i].createdAt);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });
  });

  describe('Loan creation snapshots seller commission defaults', () => {
    let clientId: string;
    let clientEmail: string;
    let testVendorToken: string;
    let testVendorId: string;

    beforeEach(async () => {
      const vendorEmail = `snapvendor-${Date.now()}@example.com`;
      const vendorRes = await request(app)
        .post('/api/auth/register')
        .send({ email: vendorEmail, password: 'vendor123456', firstName: 'Snap', lastName: 'Vendor', role: Role.VENDEDOR });
      testVendorToken = vendorRes.body.data.accessToken;
      testVendorId = vendorRes.body.data.user.id;

      await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendorId: testVendorId, percentage: 5, mode: 'PROPORTIONAL' });

      clientEmail = `client-snapshot-${Date.now()}@example.com`;
      const clientRes = await request(app)
        .post('/api/auth/register')
        .send({ email: clientEmail, password: 'test123456', firstName: 'Client', lastName: 'Snapshot', role: Role.CLIENTE });
      const userId = clientRes.body.data.user.id;
      const clientRecord = await prisma.client.findUnique({ where: { userId } });
      clientId = clientRecord!.id;
    });

    afterEach(async () => {
      if (clientEmail) {
        const client = await prisma.user.findUnique({ where: { email: clientEmail } });
        if (client) {
          const loans = await prisma.loan.findMany({ where: { clientId: client.id }, select: { id: true } });
          for (const loan of loans) {
            await prisma.installment.deleteMany({ where: { loanId: loan.id } });
            await prisma.loan.delete({ where: { id: loan.id } });
          }
        }
        await prisma.user.deleteMany({ where: { email: clientEmail } });
      }
      if (testVendorId) {
        await prisma.sellerCommissionAudit.deleteMany({ where: { OR: [{ vendorId: testVendorId }, { changedBy: testVendorId }] } });
        await prisma.user.deleteMany({ where: { id: testVendorId } });
      }
    });

    it('should snapshot vendor commission defaults when VENDEDOR creates a loan', async () => {
      const loanRes = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${testVendorToken}`)
        .send({ clientId, amount: 10000, interestRate: 36, termMonths: 12, frequency: 'MONTHLY', amortizationSystem: 'FRENCH' });

      expect(loanRes.body.success).toBe(true);
      expect(loanRes.body.data.commissionPercentage).toBe('5');
      expect(loanRes.body.data.commissionMode).toBe('PROPORTIONAL');
      expect(Number(loanRes.body.data.commissionProjected)).toBeGreaterThan(0);
      expect(Number(loanRes.body.data.commissionGenerated)).toBe(0);
      expect(Number(loanRes.body.data.commissionLiquidated)).toBe(0);
    });

    it('should NOT set commission when ADMIN creates a loan (no vendor snapshot)', async () => {
      const loanRes = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId, amount: 5000, interestRate: 24, termMonths: 6, frequency: 'MONTHLY', amortizationSystem: 'FRENCH' });

      expect(loanRes.body.success).toBe(true);
      expect(loanRes.body.data.commissionPercentage).toBeNull();
      expect(loanRes.body.data.commissionMode).toBeNull();
      expect(loanRes.body.data.commissionProjected).toBeNull();
    });
  });

  describe('Payment triggers commission recalculation', () => {
    let clientId: string;
    let clientEmail: string;
    let loanId: string;
    let payVendorToken: string;
    let payVendorId: string;

    beforeEach(async () => {
      const vendorEmail = `payvendor-${Date.now()}@example.com`;
      const vendorRes = await request(app)
        .post('/api/auth/register')
        .send({ email: vendorEmail, password: 'vendor123456', firstName: 'Pay', lastName: 'Vendor', role: Role.VENDEDOR });
      payVendorToken = vendorRes.body.data.accessToken;
      payVendorId = vendorRes.body.data.user.id;

      await request(app)
        .post('/api/commissions/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendorId: payVendorId, percentage: 5, mode: 'PROPORTIONAL' });

      clientEmail = `client-recalc-${Date.now()}@example.com`;
      const clientRes = await request(app)
        .post('/api/auth/register')
        .send({ email: clientEmail, password: 'test123456', firstName: 'Client', lastName: 'Recalc', role: Role.CLIENTE });
      const userId = clientRes.body.data.user.id;
      const clientRecord = await prisma.client.findUnique({ where: { userId } });
      clientId = clientRecord!.id;

      const loanRes = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${payVendorToken}`)
        .send({ clientId, amount: 10000, interestRate: 36, termMonths: 12, frequency: 'MONTHLY', amortizationSystem: 'FRENCH' });
      loanId = loanRes.body.data.id;

      await request(app)
        .patch(`/api/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
    });

    afterEach(async () => {
      if (loanId) {
        await prisma.installment.deleteMany({ where: { loanId } });
        await prisma.loan.delete({ where: { id: loanId } }).catch(() => {});
      }
      if (clientEmail) {
        await prisma.user.deleteMany({ where: { email: clientEmail } }).catch(() => {});
      }
      if (payVendorId) {
        await prisma.sellerCommissionAudit.deleteMany({ where: { OR: [{ vendorId: payVendorId }, { changedBy: payVendorId }] } });
        await prisma.user.deleteMany({ where: { id: payVendorId } }).catch(() => {});
      }
    });

    it('should recalculate commission after a payment is registered', async () => {
      const installments = await prisma.installment.findMany({ where: { loanId }, orderBy: { installmentNumber: 'asc' } });
      const firstInstallment = installments[0];

      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${payVendorToken}`)
        .send({ loanId, installmentId: firstInstallment.id, amount: Number(firstInstallment.amount) });

      expect(payRes.body.success).toBe(true);

      await CommissionService.recalculateLoan(loanId);
      const loan = await prisma.loan.findUnique({ where: { id: loanId } });
      expect(Number(loan!.commissionGenerated)).toBeGreaterThan(0);
    });

    it('should recalculate commission after a payment is reversed', async () => {
      const installments = await prisma.installment.findMany({ where: { loanId }, orderBy: { installmentNumber: 'asc' } });
      const firstInstallment = installments[0];

      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${payVendorToken}`)
        .send({ loanId, installmentId: firstInstallment.id, amount: Number(firstInstallment.amount) });

      expect(payRes.body.success).toBe(true);
      const paymentId = payRes.body.data.id;

      await CommissionService.recalculateLoan(loanId);
      const loanAfterPay = await prisma.loan.findUnique({ where: { id: loanId } });
      expect(Number(loanAfterPay!.commissionGenerated)).toBeGreaterThan(0);

      await request(app)
        .delete(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      await CommissionService.recalculateLoan(loanId);
      const loanAfterReverse = await prisma.loan.findUnique({ where: { id: loanId } });
      expect(Number(loanAfterReverse!.commissionGenerated)).toBe(0);
    });
  });
});
