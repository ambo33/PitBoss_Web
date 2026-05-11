import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'fs';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { authRouter } from './routes/auth';
import { groupsRouter } from './routes/groups';
import { tournamentsRouter } from './routes/tournaments';
import { playersRouter } from './routes/players';
import { blindsRouter } from './routes/blinds';
import { seatingRouter } from './routes/seating';
import { getClientUrl } from './config';
import { errorHandler } from './middleware/error';
import { initSocket } from './socket';

const app = express();
const httpServer = createServer(app);

initSocket(httpServer);

app.use(helmet());
app.use(cors({ origin: getClientUrl(), credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/tournaments', playersRouter);
app.use('/api/tournaments', blindsRouter);
app.use('/api/tournaments', seatingRouter);

const webDistPath = path.resolve(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));

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
httpServer.listen(PORT, () => console.log(`PitBoss API running on :${PORT}`));
