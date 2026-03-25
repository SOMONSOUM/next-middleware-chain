import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import type { MiddlewareFactory } from "../types";

export interface RateLimitStore {
  /** Returns current count after increment */
  increment(key: string, windowMs: number): Promise<number>;
}

// Default: in-memory store (single instance only — use a real store in production)
class InMemoryStore implements RateLimitStore {
  private counts = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.counts.get(key);

    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }

    entry.count++;
    return entry.count;
  }
}

export interface RateLimitConfig {
  /** Time window in milliseconds. Default: 60_000 (1 min) */
  windowMs?: number;
  /** Max requests per window per key. Default: 100 */
  max?: number;
  /** How to derive the rate-limit key. Default: IP address */
  keyFn?: (request: NextRequest) => string;
  /** Plug in your own store (e.g. Upstash Redis) */
  store?: RateLimitStore;
  /** Custom response when limit is exceeded */
  onLimitReached?: (request: NextRequest) => NextResponse;
}

/**
 * Creates a rate-limiting middleware function.
 *
 * The middleware function will check how many requests have been made
 * within the given time window (default: 1 minute), and
 * will return a 429 status code with a custom response if the
 * limit is exceeded.
 *
 * @param config An object with the following optional properties:
 *   - `windowMs`: The time window in milliseconds. Default: 60_000 (1 min)
 *   - `max`: The max number of requests per time window per key. Default: 100
 *   - `keyFn`: A function that takes a NextRequest and returns the rate-limit key.
 *     Default: IP address (or "anonymous" if IP address is unavailable)
 *   - `store`: An object that implements the RateLimitStore interface. Default: an in-memory store
 *   - `onLimitReached`: A function that takes a NextRequest and returns a custom response when the limit is exceeded.
 *     Default: returns a 429 status code with the response body "Too Many Requests"
 *
 * @returns A middleware function that checks the rate limit and returns the custom response if the limit is exceeded.
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig = {},
): MiddlewareFactory {
  const {
    windowMs = 60_000,
    max = 100,
    keyFn = (req) =>
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "anonymous",
    store = new InMemoryStore(),
    onLimitReached = () =>
      new NextResponse("Too Many Requests", { status: 429 }),
  } = config;

  return (next) =>
    async (
      request: NextRequest,
      event: NextFetchEvent,
      response: NextResponse,
    ) => {
      const key = keyFn(request);
      const count = await store.increment(key, windowMs);

      if (count > max) {
        return onLimitReached(request);
      }

      return next(request, event, response);
    };
}
