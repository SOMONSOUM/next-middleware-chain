# Next Middleware Chain

A fluent, composable middleware chain builder for Next.js. Chain built-in and custom middleware together with a clean builder API.

## Installation

```bash
npm install next-middleware-chain
```

## Quick Start

```typescript
// proxy.ts or middleware.ts
import { middlewareChain, type MiddlewareFactory } from "next-middleware-chain";
import { NextResponse } from "next/server";
import { myApi } from "@/lib/api";

// custom middleware
const authMiddleware: MiddlewareFactory = (next) => async (req, event, res) => {
  const token = req.cookies.get("accessToken")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));
  return next(req, event, res);
};

export default middlewareChain()
  .log({ level: "info" })
  .refresh({ refreshFn: (token) => myApi.refresh(token) })
  .rateLimit({ windowMs: 60_000, max: 100 })
  .use(authMiddleware)
  .build();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

## Built-in Middleware

### `.log(config?)`

Logs every request with method, pathname, status code, duration, and IP.

```typescript
middlewareChain()
  .log({
    level: "info", // "debug" | "info" | "warn" | "error"
    filter: (req) => !req.nextUrl.pathname.startsWith("/api/health"), // skip health checks
    logFn: (entry) => console.log(entry), // custom log handler
  })
  .build();
```

**`LoggerConfig`**

| Option   | Type                                     | Default          | Description                                  |
| -------- | ---------------------------------------- | ---------------- | -------------------------------------------- |
| `level`  | `"debug" \| "info" \| "warn" \| "error"` | `"info"`         | Log level passed to `console[level]`         |
| `filter` | `(req: NextRequest) => boolean`          | `() => true`     | Return `false` to skip logging for a request |
| `logFn`  | `(entry: LogEntry) => void`              | `console[level]` | Override the log output entirely             |

**`LogEntry`**

```typescript
interface LogEntry {
  timestamp: string; // ISO 8601
  method: string; // GET, POST, ...
  pathname: string; // /dashboard
  status?: number; // 200, 302, 429, ...
  durationMs: number; // total time in ms
  ip?: string; // x-forwarded-for or x-real-ip
}
```

---

### `.rateLimit(config?)`

Rate limits requests by IP address (or a custom key). Uses an in-memory store by default — plug in Redis or any external store for production.

```typescript
middlewareChain()
  .rateLimit({
    windowMs: 60_000, // 1 minute window
    max: 100, // max requests per window
    keyFn: (req) => {
      const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
      const route = req.nextUrl.pathname.split("/")[1];
      return `rl:${ip}:${route}`;
    },
    onLimitReached: () =>
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
  })
  .build();
```

**`RateLimitConfig`**

| Option           | Type                                 | Default                 | Description                                                 |
| ---------------- | ------------------------------------ | ----------------------- | ----------------------------------------------------------- |
| `windowMs`       | `number`                             | `60_000`                | Time window in milliseconds                                 |
| `max`            | `number`                             | `100`                   | Max requests per window per key                             |
| `keyFn`          | `(req: NextRequest) => string`       | IP address              | Derive the rate-limit key per request                       |
| `store`          | `RateLimitStore`                     | `InMemoryStore`         | Custom store (see [Custom Store](#custom-rate-limit-store)) |
| `onLimitReached` | `(req: NextRequest) => NextResponse` | `429 Too Many Requests` | Custom response when limit is exceeded                      |

> **Note:** The built-in `InMemoryStore` only works correctly in single-process environments. Use a Redis-backed store in production.

---

### `.refresh(config)`

Automatically refreshes an expired JWT access token using a refresh token. On success it sets fresh cookies and continues the request. On failure it clears both cookies and redirects to the login page.

```typescript
middlewareChain()
  .refresh({
    refreshFn: async (refreshToken) => {
      const res = await fetch("https://your-api.com/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      return res.json(); // must return { accessToken, refreshToken }
    },
  })
  .build();
```

**`RefreshTokenConfig`**

| Option          | Type                                                                                  | Default                               | Description                                         |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `refreshFn`     | `(token: string) => Promise<{ accessToken?: string; refreshToken?: string } \| null>` | —                                     | **Required.** Calls your API and returns new tokens |
| `loginPath`     | `string`                                                                              | `"/login"`                            | Redirect target when refresh fails                  |
| `cookieNames`   | `{ accessToken?: string; refreshToken?: string }`                                     | `{ accessToken, refreshToken }`       | Override cookie names if yours differ               |
| `cookieOptions` | `{ maxAge?, sameSite?, secure?, httpOnly? }`                                          | `{ httpOnly, secure, lax, 7d }`       | Options applied to both cookies when setting        |
| `isExpired`     | `(exp?: number) => boolean`                                                           | Compares `exp * 1000` to `Date.now()` | Override the default expiry check                   |

**With all options:**

```typescript
middlewareChain()
  .refresh({
    refreshFn: (token) => myApi.refresh(token),
    loginPath: "/auth/login",
    cookieNames: {
      accessToken: "access_token",
      refreshToken: "refresh_token",
    },
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
    isExpired: (exp) => !exp || Date.now() >= exp * 1000,
  })
  .build();
```

> **Note:** Always place `.refresh()` **before** your auth middleware so the token is fresh by the time the auth check runs.

---

### `.use(factory)`

Register any custom middleware. This is the primary way to add auth, CSRF protection, CORS, maintenance mode, or any other app-specific logic.

```typescript
const myMiddleware: MiddlewareFactory = (next) => async (req, event, res) => {
  // do something before
  const result = await next(req, event, res);
  // do something after
  return result;
};

middlewareChain().use(myMiddleware).build();
```

---

## Custom Middleware

Every middleware is a `MiddlewareFactory` — a function that receives the next handler and returns a new handler. Import the type to get full TypeScript support.

```typescript
import type { MiddlewareFactory } from "next-middleware-chain";
import { NextResponse } from "next/server";

const corsMiddleware: MiddlewareFactory = (next) => async (req, event, res) => {
  if (!req.nextUrl.pathname.startsWith("/api")) {
    return next(req, event, res);
  }

  const result = await next(req, event, res);
  const response = result ?? NextResponse.next();

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  return response;
};
```

---

### Custom Rate Limit Store

Implement the `RateLimitStore` interface to use any external store. Example with Upstash Redis:

```typescript
import { middlewareChain } from "next-middleware-chain";
import type { RateLimitStore } from "next-middleware-chain";
import { Redis } from "@upstash/redis";

class UpstashStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, windowMs);
    return count;
  }
}

export default middlewareChain()
  .rateLimit({
    store: new UpstashStore(Redis.fromEnv()),
    windowMs: 60_000,
    max: 200,
  })
  .build();
```

---

## API Reference

### `middlewareChain()`

Returns a `MiddlewareBuilder` instance. Chain methods then call `.build()` to produce the Next.js middleware function.

### `MiddlewareBuilder`

| Method                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `.log(config?)`       | Add request logging                                 |
| `.rateLimit(config?)` | Add rate limiting                                   |
| `.use(factory)`       | Add any custom `MiddlewareFactory`                  |
| `.build()`            | Finalise and return the Next.js middleware function |

### `chain(factories)`

Low-level function that composes an array of `MiddlewareFactory` functions into a single handler. Use this if you prefer to skip the builder.

### Types

```typescript
// A middleware function
type MiddlewareHandler = (
  request: NextRequest,
  event: NextFetchEvent,
  response: NextResponse,
) => NextMiddlewareResult | Promise<NextMiddlewareResult>;

// A factory that wraps a handler and returns a new handler
type MiddlewareFactory = (next: MiddlewareHandler) => MiddlewareHandler;
```

---

## Requirements

- Node.js 18+
- Next.js 15+
- TypeScript 5+ (TypeScript 6 recommended)

## License

MIT © SOUM SOMON
