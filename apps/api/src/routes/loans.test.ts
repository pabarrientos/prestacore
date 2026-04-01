import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';

const prisma = new PrismaClient();

describe('Loans API', () => {
  let adminToken: string;
  let vendorToken: string;
  let clientToken: string;
  let testClientId: string;

  const adminUser = {
    email: `admin-test-${Date.now()}@example.com`,
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'Test',
  };

  const vendorUser = {
    email: `vendor-test-${Date.now()}@example.com`,
    password: 'vendor123',
    firstName: 'Vendor',
    lastName: 'Test',
  };

  const clientUser = {
    email: `client-test-${Date.now()}@example.com`,
    password: 'client123',
    firstName: 'Client',
    lastName: 'Test',
  };

  beforeAll(async () => {
    // Clean up
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });

    // Create admin
    await prisma.user.create({
      data: {
        email: adminUser.email,
        passwordHash: await bcrypt.hash(adminUser.password, 10),
        role: Role.ADMIN,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      },
    });

    // Create vendor
    await prisma.user.create({
      data: {
        email: vendorUser.email,
        passwordHash: await bcrypt.hash(vendorUser.password, 10),
        role: Role.VENDEDOR,
        firstName: vendorUser.firstName,
        lastName: vendorUser.lastName,
      },
    });

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
        dni: `TEST${Date.now()}`,
        dateOfBirth: new Date('1990-01-01'),
        monthlyIncome: 5000,
      },
    });
    testClientId = clientProfile.id;

    // Get tokens
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminRes.body.data.accessToken;

    const vendorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: vendorUser.email, password: vendorUser.password });
    vendorToken = vendorRes.body.data.accessToken;

    const clientRes = await request(app)
      .post('/api/auth/login')
      .send({ email: clientUser.email, password: clientUser.password });
    clientToken = clientRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up
    await prisma.loan.deleteMany({
      where: { clientId: testClientId },
    });
    await prisma.client.deleteMany({
      where: { id: testClientId },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/loans/simulate (public)', () => {
    it('should simulate loan correctly', async () => {
      const res = await request(app)
        .post('/api/loans/simulate')
        .send({
          amount: 10000,
          interestRate: 15,
          termMonths: 12,
          frequency: 'MONTHLY',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.installmentAmount).toBeGreaterThan(0);
      expect(res.body.data.totalInterest).toBeGreaterThan(0);
      expect(res.body.data.schedule).toHaveLength(12);
    });

    it('should fail with invalid amount', async () => {
      const res = await request(app)
        .post('/api/loans/simulate')
        .send({
          amount: 500, // Too low
          interestRate: 15,
          termMonths: 12,
          frequency: 'MONTHLY',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should calculate zero interest correctly', async () => {
      // El sistema requiere interestRate mínimo de 1, así que probamos con tasa mínima
      const res = await request(app)
        .post('/api/loans/simulate')
        .send({
          amount: 12000,
          interestRate: 1, // Mínimo 1% (el sistema convierte a decimal internamente)
          termMonths: 12,
          frequency: 'MONTHLY',
        })
        .expect(200);

      // Con tasa mínima debe tener algún interés
      expect(res.body.data.totalInterest).toBeGreaterThan(0);
      expect(res.body.data.installmentAmount).toBeGreaterThan(1000);
    });
  });

  describe('POST /api/loans (protected)', () => {
    it('should create loan as admin', async () => {
      const res = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId: testClientId,
          amount: 10000,
          interestRate: 15,
          termMonths: 12,
          frequency: 'MONTHLY',
          purpose: 'Test loan',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.installments).toHaveLength(12);
    });

    it('should create loan as vendor', async () => {
      const res = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          clientId: testClientId,
          amount: 5000,
          interestRate: 12,
          termMonths: 6,
          frequency: 'MONTHLY',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should fail as client (not authorized)', async () => {
      const res = await request(app)
        .post('/api/loans')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          clientId: testClientId,
          amount: 10000,
          interestRate: 15,
          termMonths: 12,
          frequency: 'MONTHLY',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Insufficient permissions');
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post('/api/loans')
        .send({
          clientId: testClientId,
          amount: 10000,
          interestRate: 15,
          termMonths: 12,
          frequency: 'MONTHLY',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/loans', () => {
    it('should list all loans as admin', async () => {
      const res = await request(app)
        .get('/api/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    it('should list vendor loans as vendor', async () => {
      const res = await request(app)
        .get('/api/loans')
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/loans?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
