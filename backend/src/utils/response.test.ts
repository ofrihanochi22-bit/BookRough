import { describe, expect, it } from 'vitest';

import { failure, success } from './response.js';

describe('success', () => {
  it('wraps data in the success envelope', () => {
    // Arrange
    const data = { id: 'abc', username: 'ofri' };

    // Act
    const body = success(data);

    // Assert
    expect(body).toEqual({ status: 'success', data });
  });

  it('keeps a null payload rather than dropping the key', () => {
    expect(success(null)).toEqual({ status: 'success', data: null });
  });
});

describe('failure', () => {
  it('wraps a code and message in the error envelope', () => {
    // Act
    const body = failure(404, 'Community not found.');

    // Assert
    expect(body).toEqual({ status: 'error', code: 404, message: 'Community not found.' });
  });

  it('never includes a data key, which would confuse the two envelopes', () => {
    expect(failure(500, 'Something went wrong.')).not.toHaveProperty('data');
  });
});
