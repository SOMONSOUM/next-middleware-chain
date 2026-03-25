export { middlewareChain } from "./builder";

// Types users need to write custom middleware
export type { MiddlewareFactory, MiddlewareHandler } from "./types";

// Config types for each built-in (for when users define config separately)
export type { RefreshTokenConfig } from "./middlewares/refresh-token";
export type { RateLimitConfig, RateLimitStore } from "./middlewares/rate-limit";
export type { LoggerConfig, LogEntry } from "./middlewares/logger";

// Low-level chain() for power users who skip the builder
export { chain } from "./chain";
