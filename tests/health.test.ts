import request from 'supertest';
import { app } from '../src/app';

describe('Health Endpoint Tests', () => {
  it('GET /api/health should return 200 with healthy status and metadata', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptimeSeconds');
    expect(response.body).toHaveProperty('database', 'connected');
    expect(response.body).toHaveProperty('version', '1.0.0');
    expect(response.body).toHaveProperty('app', 'WorkSphere HR System API');
  });

  it('GET /api/nonexistent should return 404 with standard error format', async () => {
    const response = await request(app).get('/api/nonexistent');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
