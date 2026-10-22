import { usageError } from "./usage-client";

// A server action that can't reach the server (no signal) rejects with a TypeError ("Failed to
// fetch"). Unanswered, that replaced the whole job page with the error screen and took what was
// typed with it; these say so where the button is instead.

/** A change that couldn't reach the server. */
export const NO_CONNECTION = "Couldn’t save. Check your connection and try again.";

/** True for the error a server action rejects with when the request never reached the server. */
export function isNoConnection(e: unknown): boolean {
  return e instanceof TypeError;
}

/**
 * The action, answering `{ error: NO_CONNECTION }` (on top of the last state) when the request
 * never reached the server. Errors the server sent are left as they were.
 */
export function orOffline<S extends { error?: string | null }, P>(
  action: (state: S, payload: P) => Promise<S>,
): (state: S, payload: P) => Promise<S> {
  return async (state, payload) => {
    let next: S;
    try {
      next = await action(state, payload);
    } catch (e) {
      if (!isNoConnection(e)) throw e;
      next = { ...state, message: undefined, error: NO_CONNECTION };
    }
    // A save that didn't work: counted in the Admin portal's Usage (owner, 2026-10-22).
    if (next?.error) usageError(next.error);
    return next;
  };
}

/**
 * What a server action call answered, or `fallback` when the request never reached the server
 * (for calls made outside a form, e.g. a button's transition).
 */
export async function whenOffline<T>(call: Promise<T>, fallback: T): Promise<T> {
  try {
    return await call;
  } catch (e) {
    if (!isNoConnection(e)) throw e;
    return fallback;
  }
}
