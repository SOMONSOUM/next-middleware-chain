import { chain } from "./chain";
import {
  createRefreshTokenMiddleware,
  type RefreshTokenConfig,
} from "./middlewares/refresh-token";

import type { MiddlewareFactory, MiddlewareHandler } from "./types";
import type { NextRequest, NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";

export class MiddlewareBuilder {
  private factories: MiddlewareFactory[] = [];

  /** JWT token refresh — should come BEFORE auth */
  refresh(config: RefreshTokenConfig): this {
    this.factories.push(createRefreshTokenMiddleware(config));
    return this;
  }

  /** Escape hatch: add any custom MiddlewareFactory */
  use(factory: MiddlewareFactory): this {
    this.factories.push(factory);
    return this;
  }

  /**
   * Finalises the chain and returns a Next.js-compatible middleware function.
   * Call this as the default export of your middleware.ts.
   */
  build(): (
    request: NextRequest,
    event: NextFetchEvent,
  ) => ReturnType<MiddlewareHandler> {
    const handler = chain(this.factories);
    return (request: NextRequest, event: NextFetchEvent) => {
      return handler(request, event, NextResponse.next());
    };
  }
}

/** Entry point — call this to start building your middleware stack */
export function middlewareChain(): MiddlewareBuilder {
  return new MiddlewareBuilder();
}
