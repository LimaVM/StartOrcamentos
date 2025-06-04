const request = require('supertest');
const app = require('../server');

describe('GET /api/produtos', () => {
  it('retorna status 200 e um array', async () => {
    const res = await request(app).get('/api/produtos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/produtos/:id', () => {
  it('retorna 404 para ID inexistente', async () => {
    const res = await request(app).get('/api/produtos/nonexistent-id');
    expect(res.status).toBe(404);
  });
});
