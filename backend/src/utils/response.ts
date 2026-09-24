/**
 * The two response envelopes, defined once (CLAUDE.md §4).
 * Nothing else in the codebase builds a JSON body by hand.
 */

export interface SuccessBody<T> {
  status: 'success';
  data: T;
}

export interface ErrorBody {
  status: 'error';
  code: number;
  message: string;
}

export function success<T>(data: T): SuccessBody<T> {
  return { status: 'success', data };
}

export function failure(code: number, message: string): ErrorBody {
  return { status: 'error', code, message };
}
