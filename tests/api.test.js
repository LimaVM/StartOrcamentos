const request = require('supertest');
const app = require('../server');

describe('GET /api/produtos', () => {
  it('retorna status 200 e um array', async () => {
    const res = await request(app).get('/api/produtos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
