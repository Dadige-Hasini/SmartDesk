import app from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { startEmailWorker, stopEmailWorker } from './services/email.service.js';

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`SmartDesk Server running on port ${PORT} [${config.env}]`);
  logger.info(`Health check available at http://localhost:${PORT}/api/health`);
  startEmailWorker(15000); // Poll outbox every 15 seconds
});

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Gracefully shutting down SmartDesk server...`);
  stopEmailWorker();
  server.close(() => {
    logger.info('HTTP server closed cleanly.');
    process.exit(0);
  });

  // Force exit if hanging
  setTimeout(() => {
    logger.error('Forceful shutdown triggered after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
