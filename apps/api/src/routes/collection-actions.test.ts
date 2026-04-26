import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role, CollectionActionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../index';

const prisma = new PrismaClient();

describe('Collection Actions API', () => {
  let adminToken: string;
  let vendorToken: string;
  let clientToken: string;
  let testLoanId: string;
  let testClientId: string;

  const adminUser = {
    email: `admin-ca-test-${Date.now()}@example.com`,
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'CA',
  };

  const vendorUser = {
    email: `vendor-ca-test-${Date.now()}@example.com`,
    password: 'vendor123',
    firstName: 'Vendor',
    lastName: 'CA',
  };

  const clientUser = {
    email: `client-ca-test-${Date.now()}@example.com`,
    password: 'client123',
    firstName: 'Client',
    lastName: 'CA',
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
        dni: `CATEST${Date.now()}`,
        dateOfBirth: new Date('1990-01-01'),
        monthlyIncome: 5000,
      },
    });
    testClientId = clientProfile.id;

    // Create a test loan
    const loan = await prisma.loan.create({
      data: {
        clientId: testClientId,
        amount: 10000,
        interestRate: 0.05,
        termMonths: 6,
        frequency: 'MONTHLY',
        status: 'ACTIVE',
        amortizationSystem: 'FRENCH',
        totalInterest: 1500,
        totalPayment: 11500,
        installmentAmount: 1916.67,
      },
    });
    testLoanId = loan.id;

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
    // Clean up collection actions first
    if (testLoanId) {
      await prisma.collectionAction.deleteMany({
        where: { loanId: testLoanId },
      });
      // Then delete loan
      await prisma.loan.deleteMany({
        where: { id: testLoanId },
      });
    }
    // Then client, vendor, admin
    await prisma.user.deleteMany({
      where: { email: { in: [adminUser.email, vendorUser.email, clientUser.email] } },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/collection-actions/:loanId', () => {
    it('should return empty array for loan with no collection actions', async () => {
      const res = await request(app)
        .get(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for non-existent loan', async () => {
      const res = await request(app)
        .get('/api/collection-actions/non-existent-id')
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Loan not found');
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .get(`/api/collection-actions/${testLoanId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/collection-actions/:loanId', () => {
    it('should create a collection action with required fields only', async () => {
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          type: 'CALL',
          description: 'Llamada de seguimiento',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('CALL');
      expect(res.body.data.description).toBe('Llamada de seguimiento');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('should create a collection action with all fields', async () => {
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'VISIT',
          description: 'Visita presencial al cliente',
          result: 'Cliente no se encuentra',
          nextAction: 'CALL',
          followUpDate: '2026-04-30',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('VISIT');
      expect(res.body.data.result).toBe('Cliente no se encuentra');
      expect(res.body.data.nextAction).toBe('CALL');
      expect(res.body.data.typeLabel).toBe('Visita presencial');
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          description: 'Solo descripción sin tipo',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 with invalid type', async () => {
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          type: 'INVALID_TYPE',
          description: 'Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid type');
    });

    it('should return 404 for non-existent loan', async () => {
      const res = await request(app)
        .post('/api/collection-actions/non-existent-id')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          type: 'CALL',
          description: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Loan not found');
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .send({
          type: 'CALL',
          description: 'Test',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/collection-actions/:id', () => {
    let actionId: string;

    beforeEach(async () => {
      // Create a collection action to delete
      const res = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          type: 'CALL',
          description: 'Action to delete',
        });
      actionId = res.body.data.id;
    });

    it('should delete collection action as admin', async () => {
      const res = await request(app)
        .delete(`/api/collection-actions/${actionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('CollectionAction deleted successfully');
    });

    it('should return 403 when vendor tries to delete', async () => {
      // First create a new action to try to delete
      const createRes = await request(app)
        .post(`/api/collection-actions/${testLoanId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          type: 'CALL',
          description: 'Action to delete by vendor',
        });
      const actionToDelete = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/collection-actions/${actionToDelete}`)
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent action', async () => {
      const res = await request(app)
        .delete('/api/collection-actions/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('CollectionAction not found');
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .delete(`/api/collection-actions/${actionId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/settings/collection-action-types', () => {
    it('should return default collection action types', async () => {
      const res = await request(app)
        .get('/api/settings/collection-action-types');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.types).toBeDefined();
      expect(Array.isArray(res.body.data.types)).toBe(true);
      expect(res.body.data.types.length).toBeGreaterThan(0);
      expect(res.body.data.types[0]).toHaveProperty('code');
      expect(res.body.data.types[0]).toHaveProperty('label');
    });
  });
});
