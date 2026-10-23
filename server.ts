import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest } from './src/server/apiMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// API middleware bridge
app.use('/api', (req, res, next) => {
  const handled = handleApiRequest(req, res);
  if (!handled) {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Serve frontend static files from dist directory
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback: any unknown route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(Number(PORT), HOST, () => {
  console.log(`[Fireball] Production server running on http://${HOST}:${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('[Fireball] Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
