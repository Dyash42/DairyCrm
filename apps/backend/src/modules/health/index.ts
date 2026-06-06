import type { App } from '../../types';

export async function registerHealthRoutes(app: App) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'jharanai-backend',
    timestamp: new Date().toISOString(),
  }));
}
