import { ActionError } from '@/lib/auth/errors';

/**
 * Discriminated union for server-action return values. Server actions in
 * Next.js 15 do not propagate thrown errors to the client `await`'s catch
 * block in production — they get routed to the route's error boundary.
 * To surface user-facing errors inline, return them as data.
 *
 * Usage in actions:
 *   export async function fooAction(input: unknown): Promise<ActionResult<Foo>> {
 *     try {
 *       // ... existing logic that may throw ActionError ...
 *       return { ok: true, data: result };
 *     } catch (err) {
 *       return errorToResult(err);
 *     }
 *   }
 *
 * Usage in client forms:
 *   const res = await fooAction(input);
 *   if (!res.ok) { setError(res.message); return; }
 *   // res.data is fully typed
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

interface ZodLikeIssue {
  message: string;
  path?: ReadonlyArray<string | number>;
}
interface ZodLikeError {
  issues: ZodLikeIssue[];
}

function isZodLikeError(err: unknown): err is ZodLikeError {
  return (
    !!err &&
    typeof err === 'object' &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  );
}

function isFrameworkSignal(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('digest' in err)) return false;
  const digest = (err as { digest: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND';
}

export function errorToResult(err: unknown): { ok: false; code: string; message: string } {
  // Next.js uses thrown errors with special `digest` strings to signal redirect
  // and notFound. They MUST propagate to the framework — never swallow.
  if (isFrameworkSignal(err)) {
    throw err;
  }
  if (err instanceof ActionError) {
    return { ok: false, code: err.code, message: err.message };
  }
  if (isZodLikeError(err)) {
    const first = err.issues[0];
    const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
    return {
      ok: false,
      code: 'VALIDATION',
      message: `${path}${first?.message ?? 'Validation failed'}`,
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { ok: false, code: 'UNKNOWN', message };
}
