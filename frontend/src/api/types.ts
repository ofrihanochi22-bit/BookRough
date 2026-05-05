/**
 * Backend API response envelope types.
 *
 * Every response from the backend follows one of two shapes
 * (enforced by `backend/src/utils/response.ts`):
 *
 *   Success: { status: "success", data: T }
 *   Error:   { status: "error", code: number, message: string }
 *
 * Using these generics in API modules gives the frontend type-safe payloads
 * without manually casting `response.data` everywhere.
 */

export interface ApiSuccess<T> {
  status: "success";
  data: T;
}

export interface ApiError {
  status: "error";
  code: number;
  message: string;
  errorCode?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
