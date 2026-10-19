import { app } from './app';
import { config } from './config/environment';
import { connectDatabase, disconnectDatabase } from './database/prisma';

let server: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  try {
    // Connect to database
    await connectDatabase();
    console.log(`[Database] Connected to SQLite database at ${config.databaseUrl}`);

    // Start Express server
    server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[WorkSphere API] Server listening on port ${config.port}`);
      console.log(`[WorkSphere API] Base URL: http://localhost:${config.port}${config.apiPrefix}`);
      console.log(`[WorkSphere API] Health Check: http://localhost:${config.port}${config.apiPrefix}/health`);
    });
  } catch (error) {
    console.error('[WorkSphere API] Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[WorkSphere API] Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[WorkSphere API] HTTP server closed.');
      try {
        await disconnectDatabase();
        console.log('[Database] Disconnected from SQLite database.');
      } catch (err) {
        console.error('[Database] Error during disconnection:', err);
      } finally {
        process.exit(0);
      }
    });

    // Force exit if not closed in 5 seconds
    setTimeout(() => {
      console.error('[WorkSphere API] Forcefully shutting down after timeout.');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

bootstrap();
