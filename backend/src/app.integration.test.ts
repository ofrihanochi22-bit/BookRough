import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 in the success envelope', async () => {
    // Act
    const response = await request(app).get('/api/health');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.status).toBe('ok');
    expect(typeof response.body.data.uptime).toBe('number');
    expect(Date.parse(response.body.data.timestamp)).not.toBeNaN();
  });

  it('answers without a database connection, because it never queries one', async () => {
    // Arrange — nothing in this suite starts Postgres. That is the assertion.
    // Act
    const response = await request(app).get('/api/health');

    // Assert
    expect(response.status).toBe(200);
  });
});

describe('the central error handler', () => {
  it('turns a thrown AppError into the error envelope with its own status', async () => {
    // Act
    const response = await request(app).get('/api/__boom');

    // Assert
    expect(response.status).toBe(418);
    expect(response.body).toEqual({
      status: 'error',
      code: 418,
      message: 'Intentional test failure',
    });
  });

  it('never leaks a stack trace to the client', async () => {
    // Act
    const response = await request(app).get('/api/__boom');

    // Assert
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toContain('app.ts');
  });
});

describe('an unmatched route', () => {
  it('returns 404 in the error envelope rather than Express HTML', async () => {
    // Act
    const response = await request(app).get('/api/does-not-exist');

    // Assert
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 'error',
      code: 404,
      message: 'Route not found.',
    });
  });

  it('applies outside the /api prefix too', async () => {
    // Act
    const response = await request(app).post('/definitely-not-a-route');

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.status).toBe('error');
  });
});
