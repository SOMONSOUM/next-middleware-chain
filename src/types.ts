import type { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import type { NextMiddlewareResult } from "next/dist/server/web/types";

export type MiddlewareHandler = (
  request: NextRequest,
  event: NextFetchEvent,
  response: NextResponse,
) => NextMiddlewareResult | Promise<NextMiddlewareResult>;

// A factory wraps a "next" handler and returns a new handler
export type MiddlewareFactory = (next: MiddlewareHandler) => MiddlewareHandler;
