export { middlewareChain } from "./builder";

// Types users need to write custom middleware
export type { MiddlewareFactory, MiddlewareHandler } from "./types";

// Config types for each built-in (for when users define config separately)
export type { RefreshTokenConfig } from "./middlewares/refresh-token";

// Low-level chain() for power users who skip the builder
export { chain } from "./chain";
