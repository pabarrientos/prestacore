import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import app from '../index';

const prisma = new PrismaClient();

// Mock child_process for pg_dump/pg_restore
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  exec: vi.fn(),
}));

describe('Backups API', () => {
  let adminToken: string;
  let vendorToken: string;
  
  const adminUser = {
    email: `admin-backup-test-${Date.now()}@example.com`,
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'Backup',
  };

  const vendorUser = {
    email: `vendor-backup-test-${Date.now()}@example.com`,
    password: 'vendor123',
    firstName: 'Vendor',
    lastName: 'Backup',
  };

  beforeAll(async () => {
    // Ensure test backup directory exists
    await fs.mkdir('/tmp/test-backups', { recursive: true });
    
    // Clean up
    await prisma.user.deleteMany({ where: { email: { in: [adminUser.email, vendorUser.email] } } });
    await prisma.backup.deleteMany();
    await prisma.setting.deleteMany({ where: { key: { in: ['BACKUP_SCHEDULE', 'BACKUP_RETENTION'] } } });

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

    // Get tokens
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
    await prisma.user.deleteMany({ where: { email: { in: [adminUser.email, vendorUser.email] } } });
    await prisma.backup.deleteMany();
    await prisma.setting.deleteMany({ where: { key: { in: ['BACKUP_SCHEDULE', 'BACKUP_RETENTION'] } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== GET /api/backups - List backups ==========
  describe('GET /api/backups', () => {
    it('should list all backups for admin', async () => {
      // Create a test backup
      await prisma.backup.create({
        data: {
          filename: 'test-backup.dump',
          filepath: '/tmp/test-backups/test-backup.dump',
          sizeBytes: 1024,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .get('/api/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject non-admin user', async () => {
      const res = await request(app)
        .get('/api/backups')
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Insufficient permissions');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/backups')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== GET /api/backups/schedule - Get schedule ==========
  describe('GET /api/backups/schedule', () => {
    it('should return schedule config for admin', async () => {
      // Create schedule setting
      await prisma.setting.upsert({
        where: { key: 'BACKUP_SCHEDULE' },
        update: { value: JSON.stringify({ enabled: true, frequency: 'daily', hour: 3 }) },
        create: { key: 'BACKUP_SCHEDULE', value: JSON.stringify({ enabled: true, frequency: 'daily', hour: 3 }) },
      });

      const res = await request(app)
        .get('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('enabled');
      expect(res.body.data).toHaveProperty('frequency');
      expect(res.body.data).toHaveProperty('hour');
    });

    it('should return null when no schedule configured', async () => {
      await prisma.setting.deleteMany({ where: { key: 'BACKUP_SCHEDULE' } });

      const res = await request(app)
        .get('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('should reject non-admin user', async () => {
      const res = await request(app)
        .get('/api/backups/schedule')
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== PATCH /api/backups/schedule - Update schedule ==========
  describe('PATCH /api/backups/schedule', () => {
    it('should update schedule config for admin', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          frequency: 'daily',
          hour: 3,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('enabled', true);
      expect(res.body.data).toHaveProperty('frequency', 'daily');
      expect(res.body.data).toHaveProperty('hour', 3);
    });

    it('should update weekly schedule config', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          frequency: 'weekly',
          hour: 2,
          dayOfWeek: 1,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('frequency', 'weekly');
      expect(res.body.data).toHaveProperty('dayOfWeek', 1);
    });

    it('should update monthly schedule config', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          frequency: 'monthly',
          hour: 1,
          dayOfMonth: 1,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('frequency', 'monthly');
      expect(res.body.data).toHaveProperty('dayOfMonth', 1);
    });

    it('should validate frequency enum', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          frequency: 'yearly',
          hour: 3,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should validate hour range', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          frequency: 'daily',
          hour: 25,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin user', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ enabled: true, frequency: 'daily', hour: 3 })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .patch('/api/backups/schedule')
        .send({ enabled: true, frequency: 'daily', hour: 3 })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== GET /api/backups/:id/download - Download backup ==========
  describe('GET /api/backups/:id/download', () => {
    it('should return 404 for non-existent backup', async () => {
      const res = await request(app)
        .get('/api/backups/non-existent-id/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Backup not found');
    });

    it('should reject non-admin user', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test.dump',
          filepath: '/tmp/test-backups/test.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .get(`/api/backups/${backup.id}/download`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test2.dump',
          filepath: '/tmp/test-backups/test2.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .get(`/api/backups/${backup.id}/download`)
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== DELETE /api/backups/:id - Delete backup ==========
  describe('DELETE /api/backups/:id', () => {
    it('should delete a backup for admin', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-delete.dump',
          filepath: '/tmp/test-backups/test-delete.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .delete(`/api/backups/${backup.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify deleted from DB
      const deleted = await prisma.backup.findUnique({ where: { id: backup.id } });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent backup', async () => {
      const res = await request(app)
        .delete('/api/backups/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Backup not found');
    });

    it('should reject non-admin user', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test2.dump',
          filepath: '/tmp/test-backups/test2.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .delete(`/api/backups/${backup.id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test3.dump',
          filepath: '/tmp/test-backups/test3.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .delete(`/api/backups/${backup.id}`)
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== POST /api/backups/upload - Upload backup ==========
  describe('POST /api/backups/upload', () => {
    it('should reject non-admin user', async () => {
      const res = await request(app)
        .post('/api/backups/upload')
        .set('Authorization', `Bearer ${vendorToken}`)
        .attach('file', Buffer.from('test content'), { filename: 'test.sql' })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/backups/upload')
        .attach('file', Buffer.from('test content'), { filename: 'test.sql' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== GET /api/backups/preview/:id - Preview restore ==========
  describe('GET /api/backups/preview/:id', () => {
    it('should return 404 for non-existent backup', async () => {
      const res = await request(app)
        .get('/api/backups/preview/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Backup not found');
    });

    it('should reject non-admin user', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-preview.dump',
          filepath: '/tmp/test-backups/test-preview.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .get(`/api/backups/preview/${backup.id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ========== POST /api/backups/:id/restore - Restore backup ==========
  describe('POST /api/backups/:id/restore', () => {
    it('should reject restore without confirmation', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-restore.dump',
          filepath: '/tmp/test-backups/test-restore.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .post(`/api/backups/${backup.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Confirmation required');
    });

    it('should reject restore without confirm=true', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-restore2.dump',
          filepath: '/tmp/test-backups/test-restore2.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .post(`/api/backups/${backup.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: false })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Confirmation required');
    });

    it('should return 404 for non-existent backup', async () => {
      const res = await request(app)
        .post('/api/backups/non-existent-id/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Backup not found');
    });

    it('should reject non-admin user', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-restore3.dump',
          filepath: '/tmp/test-backups/test-restore3.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .post(`/api/backups/${backup.id}/restore`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ confirm: true })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request', async () => {
      const backup = await prisma.backup.create({
        data: {
          filename: 'test-restore4.dump',
          filepath: '/tmp/test-backups/test-restore4.dump',
          sizeBytes: 100,
          type: 'MANUAL',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .post(`/api/backups/${backup.id}/restore`)
        .send({ confirm: true })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });
});