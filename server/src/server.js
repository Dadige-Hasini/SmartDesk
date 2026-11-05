import app from './app.js';
import { config, validateEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { startEmailWorker, stopEmailWorker } from './services/email.service.js';
import { slaWorker } from './workers/sla.worker.js';

const PORT = config.port;

// Validate configuration safely at startup
const envValidation = validateEnv();
if (envValidation.warnings.length > 0) {
  envValidation.warnings.forEach((w) => logger.warn(`[Startup Diagnostic] ${w}`));
}
if (envValidation.errors.length > 0) {
  envValidation.errors.forEach((e) => logger.error(`[Startup Error] ${e}`));
}

const server = app.listen(PORT, () => {
  logger.info(`SmartDesk Server running on port ${PORT} [${config.env}]`);
  logger.info(`AI Services: Provider=${config.ai.provider}, Model=${config.ai.chatModel}, Embedding=${config.ai.embeddingModel} (${config.ai.embeddingDimension}d)`);
  logger.info(`Health check available at http://localhost:${PORT}/api/health`);
  startEmailWorker(15000); // Poll outbox every 15 seconds
  slaWorker.start(30000);   // Check overdue SLAs every 30 seconds
});

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Gracefully shutting down SmartDesk server...`);
  stopEmailWorker();
  slaWorker.stop();
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
