import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, onUnauthorized } from './client';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const toastError = vi.mocked(toast.error);

/**
 * Replaces the network with a canned HTTP response.
 *
 * A custom adapter is responsible for honouring `validateStatus` itself — axios
 * only does that inside its own adapters — so a non-2xx is rejected here with
 * the response attached, exactly as the real adapter would.
 */
function respondWith(status: number, data: unknown): void {
  const adapter: AxiosAdapter = async (config) => {
    const response = {
      data,
      status,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
    };

    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        null,
        response,
      );
    }

    return response;
  };
  api.defaults.adapter = adapter;
}

/** Replaces the network with a failure that never produced a response. */
function failWithoutResponse(): void {
  const adapter: AxiosAdapter = async (config) => {
    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  };
  api.defaults.adapter = adapter;
}

function stubLocation(pathname: string) {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname, assign },
    writable: true,
    configurable: true,
  });
  return assign;
}

describe('api response interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete api.defaults.adapter;
  });

  it('passes a successful response through untouched', async () => {
    // Arrange
    respondWith(200, { status: 'success', data: { id: 'abc' } });

    // Act
    const response = await api.get('/health');

    // Assert
    expect(response.data).toEqual({ status: 'success', data: { id: 'abc' } });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('on 401, redirects to Welcome exactly once and shows no toast', async () => {
    // Arrange
    const assign = stubLocation('/communities');
    respondWith(401, { status: 'error', code: 401, message: 'Not signed in.' });

    // Act
    await expect(api.get('/users/me')).rejects.toThrow();

    // Assert
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/');
    expect(toastError).not.toHaveBeenCalled();
  });

  it("on 500, toasts the backend's own message", async () => {
    // Arrange
    respondWith(500, { status: 'error', code: 500, message: 'Something went wrong.' });

    // Act
    await expect(api.get('/communities')).rejects.toThrow();

    // Assert
    expect(toastError).toHaveBeenCalledWith('Something went wrong.');
  });

  it('on a 4xx with no parsable body, falls back to a generic message', async () => {
    // Arrange
    respondWith(400, undefined);

    // Act
    await expect(api.post('/communities')).rejects.toThrow();

    // Assert
    expect(toastError).toHaveBeenCalledWith('Something went wrong.');
  });

  it('on a network error, toasts the offline message and still rejects', async () => {
    // Arrange
    failWithoutResponse();

    // Act & Assert
    await expect(api.get('/health')).rejects.toThrow();
    expect(toastError).toHaveBeenCalledWith(
      "Can't reach the server. Check your connection and try again.",
    );
  });
});

describe('onUnauthorized', () => {
  it('does not redirect when the user is already on Welcome', () => {
    // Arrange
    const assign = stubLocation('/');

    // Act
    onUnauthorized();

    // Assert
    expect(assign).not.toHaveBeenCalled();
  });
});
