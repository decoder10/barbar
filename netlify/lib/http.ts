import { json } from './barbar-auth';

/** An error that already knows its HTTP status and a message safe to show the user. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * One error response for every handler: a status-bearing error becomes that status with its
 * message; anything else is logged by name only and answered with the handler's fallback text.
 */
export function respondError(error: unknown, fallback: string, fallbackStatus = 503) {
  const status = (error as { status?: unknown })?.status;
  if (error instanceof Error && typeof status === 'number' && status >= 400 && status < 600)
    return json({ error: error.message }, status);
  console.error('Barbar handler error', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: fallback }, fallbackStatus);
}
