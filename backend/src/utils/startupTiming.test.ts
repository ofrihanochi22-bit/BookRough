import { describe, expect, it, vi } from 'vitest';

import { connectAndLog } from './startupTiming.js';

describe('connectAndLog', () => {
  it('logs how long the database connection took', async () => {
    // Arrange
    const log = { info: vi.fn(), warn: vi.fn() };
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(1300);

    // Act
    await connectAndLog(() => Promise.resolve(), log, clock);

    // Assert
    expect(log.info).toHaveBeenCalledWith({ connectMs: 1200 }, 'Database connected');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs a warning, and does not throw, when the connection fails', async () => {
    // Arrange
    const log = { info: vi.fn(), warn: vi.fn() };
    const error = new Error("Can't reach database server");
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(400);

    // Act
    await connectAndLog(() => Promise.reject(error), log, clock);

    // Assert
    expect(log.warn).toHaveBeenCalledWith(
      { err: error, connectMs: 300 },
      'Database connect failed',
    );
    expect(log.info).not.toHaveBeenCalled();
  });
});
