import './express-async';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'fs';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { authRouter } from './routes/auth';
import { groupsRouter } from './routes/groups';
import { leaguesRouter } from './routes/leagues';
import { tournamentsRouter } from './routes/tournaments';
import { playersRouter } from './routes/players';
import { blindsRouter } from './routes/blinds';
import { seatingRouter } from './routes/seating';
import { publicRouter } from './routes/public';
import { blindTimersRouter } from './routes/blindTimers';
import { adminRouter } from './routes/admin';
import { jobsRouter } from './routes/jobs';
import { feedbackRouter } from './routes/feedback';
import { aiRouter } from './routes/ai';
import { pushRouter } from './routes/push';
import { gamesRouter } from './routes/games';
import { getAllowedClientUrls } from './config';
import { errorHandler } from './middleware/error';
import { ensureDatabaseSchema } from './schema';
import { initSocket } from './socket';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection', err);
});

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/healthz',
});

initSocket(httpServer);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));
const allowedClientUrls = getAllowedClientUrls();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedClientUrls.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' }));
app.use('/api', apiLimiter);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/public', publicRouter);
app.use('/api/public', blindTimersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/ai', aiRouter);
app.use('/api/push', pushRouter);
app.use('/api/games', gamesRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/tournaments', playersRouter);
app.use('/api/tournaments', blindsRouter);
app.use('/api/tournaments', seatingRouter);

const webDistPath = path.resolve(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));

  const seoStaticPaths = [
    '/poker-timer',
    '/poker-tournament-clock',
    '/poker-tournament-director',
    '/home-poker-tournament',
    '/poker-blinds-schedule',
    '/poker-chip-calculator',
  ];

  app.get(seoStaticPaths, (req, res) => {
    res.sendFile(path.join(webDistPath, req.path, 'index.html'));
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/healthz') {
      next();
      return;
    }
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT ?? 3001;

async function start() {
  await ensureDatabaseSchema();
  httpServer.listen(PORT, () => console.log(`PitBoss API running on :${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start PitBoss API', err);
  process.exit(1);
});
