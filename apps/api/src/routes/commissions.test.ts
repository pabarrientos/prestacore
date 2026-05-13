import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role, CommissionMode, LoanStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';

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
});
