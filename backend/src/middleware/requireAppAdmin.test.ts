import type { User } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { NO_ADMIN_ACCESS, requireAppAdmin } from './requireAppAdmin.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    displayName: 'Ofri',
    displayNameKey: 'ofri',
    profilePictureUrl: null,
    useGooglePicture: false,
    preferredService: 'SPOTIFY',
    role: 'ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function run(user: User | undefined) {
  const next = vi.fn();
  requireAppAdmin({ user } as Request, {} as Response, next as NextFunction);
  return next;
}

describe('requireAppAdmin', () => {
  it('lets an onboarded admin through', () => {
    // Act
    const next = run(makeUser());

    // Assert
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['an ordinary user', makeUser({ role: 'USER' })],
    ['an admin who has not finished onboarding', makeUser({ preferredService: null })],
  ])('refuses %s with 403', (_label, user) => {
    // Act
    const next = run(user);

    // Assert
    const error = next.mock.calls[0]?.[0] as unknown as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 403, message: NO_ADMIN_ACCESS });
  });

  it('fails closed with 401 when mounted without requireAuth', () => {
    // Act
    const next = run(undefined);

    // Assert
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });
});
