import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getCorsOrigins, getEnv, isProduction } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/routes/auth.routes';
import profileRoutes from './modules/users/routes/profile.routes';
import adminUserRoutes from './modules/admin/routes/admin-user.routes';
import adminEbookRoutes from './modules/ebooks/routes/admin-ebook.routes';
import {
  booksRouter,
  categoriesRouter,
  meBooksRouter,
  meLibraryRouter,
} from './modules/ebooks/routes/viewer-ebook.routes';

export function createApp() {
  const app = express();
  const env = getEnv();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'OK',
      data: {
        env: env.NODE_ENV,
        uptime: process.uptime(),
      },
    });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/me', profileRoutes);
  app.use('/api/v1/me', meLibraryRouter);
  app.use('/api/v1/me/books', meBooksRouter);
  app.use('/api/v1/admin', adminUserRoutes);
  app.use('/api/v1/admin', adminEbookRoutes);
  app.use('/api/v1/books', booksRouter);
  app.use('/api/v1/categories', categoriesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (isProduction()) {
    // Production-ready marker for ops checks.
  }

  return app;
}
