const request = require('supertest');
const app = require('../server');

describe('health check', () => {
  it('responde sem iniciar uma porta real', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'portal-financeiro-atlasgr' });
  });
});
