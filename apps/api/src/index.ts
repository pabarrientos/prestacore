import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from 'dotenv';

import authRoutes from './routes/auth';
import loanRoutes from './routes/loans';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import clientsRoutes from './routes/clients';
import paymentRoutes from './routes/payments';
import installmentRoutes from './routes/installments';
import userRoutes from './routes/users';
import collectionActionRoutes from './routes/collection-actions';
import collectionActionByIdRoutes from './routes/collection-actions-by-id';
import commissionRoutes from './routes/commissions';
import backupRoutes from './routes/backups';
import { seedDefaultAmortizationSystem } from './services/settings';
import { startScheduler } from './services/backup/scheduler';
import { cleanupStaleRestores } from './services/backup/restore';
import { PrismaClient } from '@prisma/client';

config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/collection-actions', collectionActionRoutes);
app.use('/api/collection-actions', collectionActionByIdRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/backups', backupRoutes);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  // Seed default settings on startup
  seedDefaultAmortizationSystem().catch(err => {
    console.error('Failed to seed default amortization system:', err);
  });

  // Startup tasks for backup system (non-blocking)
  const startupPrisma = new PrismaClient();
  Promise.all([
    // Clean up any restores that were interrupted by a previous crash
    cleanupStaleRestores(startupPrisma).catch(err => {
      console.error('Failed to clean up stale restores:', err);
    }),
    // Start the backup scheduler (reads config from DB)
    startScheduler(startupPrisma).catch(err => {
      console.error('Failed to start backup scheduler:', err);
    }),
  ]);

  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
}

export default app;
