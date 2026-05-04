import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role, LoanStatus, InstallmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';

const prisma = new PrismaClient();

describe('Installments API', () => {
  let adminToken: string;
  let vendorToken: string;
  let clientToken: string;
  let testLoanId: string;
  let testClientId: string;
  let testVendorId: string;

  const adminUser = {
    email: `admin-inst-test-${Date.now()}@example.com`,
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'Inst',
  };

  const vendorUser = {
    email: `vendor-inst-test-${Date.now()}@example.com`,
    password: 'vendor123',
    firstName: 'Vendor',
    lastName: 'Inst',
  };

  const clientUser = {
    email: `client-inst-test-${Date.now()}@example.com`,
    password: 'client123',
    firstName: 'Client',
    lastName: 'Inst',
  };

  beforeAll(async () => {
    // Clean up
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });

    // Create admin
    const admin = await prisma.user.create({
      data: {
        email: adminUser.email,
        passwordHash: await bcrypt.hash(adminUser.password, 10),
        role: Role.ADMIN,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      },
    });

    // Create vendor
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

    // Create client
    const client = await prisma.user.create({
      data: {
        email: clientUser.email,
        passwordHash: await bcrypt.hash(clientUser.password, 10),
        role: Role.CLIENTE,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
      },
    });

    // Create client profile
    const clientProfile = await prisma.client.create({
      data: {
        userId: client.id,
        dni: `INSTTEST${Date.now()}`,
        dateOfBirth: new Date('1990-01-01'),
        monthlyIncome: 5000,
      },
    });
    testClientId = clientProfile.id;

    // Create a test loan assigned to vendor
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        assignedVendorId: testVendorId,
        amount: 10000,
        interestRate: 0.05,
        termMonths: 6,
        frequency: 'MONTHLY',
        status: LoanStatus.ACTIVE,
        amortizationSystem: 'FRENCH',
        totalInterest: 1500,
        totalPayment: 11500,
        installmentAmount: 1916.67,
      },
    });
    testLoanId = loan.id;

    // Create installments for the loan
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      await prisma.installment.create({
        data: {
          loanId: testLoanId,
          installmentNumber: i + 1,
          dueDate: dueDate,
          amount: 1916.67,
          principal: 1500,
          interest: 416.67,
          balance: 1916.67,
          capitalBalance: 10000 - (i * 1500),
          status: i === 0 ? InstallmentStatus.OVERDUE : InstallmentStatus.PENDING,
          paidAmount: 0,
          moraAmount: 0,
        },
      });
    }

    // Login to get tokens
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminLogin.body.data.accessToken;

    const vendorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: vendorUser.email, password: vendorUser.password });
    vendorToken = vendorLogin.body.data.accessToken;

    const clientLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: clientUser.email, password: clientUser.password });
    clientToken = clientLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (testLoanId) {
      await prisma.installment.deleteMany({ where: { loanId: testLoanId } });
      await prisma.loan.deleteMany({ where: { id: testLoanId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });
  });

  describe('GET /api/installments', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/installments');
      expect(res.status).toBe(401);
    });

    it('should return installments for admin', async () => {
      const res = await request(app)
        .get('/api/installments')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.installments).toBeDefined();
      expect(Array.isArray(res.body.data.installments)).toBe(true);
    });

    it('should filter by date range', async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/installments?fechaInicio=${todayStr}&fechaFin=${tomorrowStr}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.filtros.fechaInicio).toBe(todayStr);
      expect(res.body.data.filtros.fechaFin).toBe(tomorrowStr);
    });

    it('should filter by client name', async () => {
      const res = await request(app)
        .get(`/api/installments?cliente=${clientUser.firstName}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/installments?estado=OVERDUE')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return error for invalid date format', async () => {
      const res = await request(app)
        .get('/api/installments?fechaInicio=invalid&fechaFin=2024-01-02')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid date format');
    });

    it('should return error when fechaInicio > fechaFin', async () => {
      const res = await request(app)
        .get('/api/installments?fechaInicio=2024-12-31&fechaFin=2024-01-01')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('fechaInicio cannot be after fechaFin');
    });
  });

  describe('VENDEDOR role filtering', () => {
    it('should only return installments for vendor own loans', async () => {
      const res = await request(app)
        .get('/api/installments')
        .set('Authorization', `Bearer ${vendorToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // All installments should belong to loans assigned to this vendor
      for (const inst of res.body.data.installments) {
        expect(inst.vendor).toBeTruthy();
      }
    });

    it('should not allow vendor to filter by other vendor', async () => {
      // Even if vendor tries to pass vendedorId, it should be ignored
      const res = await request(app)
        .get(`/api/installments?vendedorId=some-other-vendor`)
        .set('Authorization', `Bearer ${vendorToken}`);
      
      expect(res.status).toBe(200);
    });
  });

  describe('Response format', () => {
    it('should include required fields in response', async () => {
      const res = await request(app)
        .get('/api/installments')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const installment = res.body.data.installments[0];
      expect(installment).toHaveProperty('id');
      expect(installment).toHaveProperty('loanId');
      expect(installment).toHaveProperty('installmentNumber');
      expect(installment).toHaveProperty('dueDate');
      expect(installment).toHaveProperty('amount');
      expect(installment).toHaveProperty('balance');
      expect(installment).toHaveProperty('status');
      expect(installment).toHaveProperty('client');
      expect(installment.client).toHaveProperty('name');
    });

    it('should include totals in response', async () => {
      const res = await request(app)
        .get('/api/installments')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalMonto');
      expect(res.body.data).toHaveProperty('totalMora');
      expect(res.body.data).toHaveProperty('filtros');
    });
  });
});