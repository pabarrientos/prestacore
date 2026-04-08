import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from 'dotenv';

import authRoutes from './routes/auth';
import loanRoutes from './routes/loans';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import clientsRoutes from './routes/clients';
import paymentRoutes from './routes/payments';
import userRoutes from './routes/users';

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
app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
}

export default app;
