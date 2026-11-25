import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { isDemoMode } from './server/config.ts';
import { dbPath, initDatabase } from './server/db.ts';
import { demoRouter, seedDemoData } from './server/demo.ts';
import { authRouter } from './server/routes/auth.ts';
import { scolariteRouter } from './server/routes/scolarite.ts';
import { studentsRouter } from './server/routes/students.ts';

initDatabase();
seedDemoData();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api', authRouter);
app.use('/api', studentsRouter);
app.use('/api', scolariteRouter);
app.use('/api', demoRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UniNotes server listening on http://0.0.0.0:${PORT}`);
    if (isDemoMode()) {
      console.log(`[MODE DÉMO] Base de démonstration : ${dbPath}`);
      console.log('[MODE DÉMO] Comptes : responsable / guichet1 / guichet2 — mot de passe : demo1234');
    }
  });
}

startServer();
