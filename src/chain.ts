import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import type { MiddlewareFactory, MiddlewareHandler } from "./types";

/**
 * Creates a middleware handler by chaining together the given
 * middleware factories.
 *
 * Each middleware factory is called with the next middleware
 * handler as an argument, which is created by recursively calling
 * this function with the next middleware factory in the array.
 *
 * If the given array of middleware factories is empty, the
 * function returns a middleware handler that simply returns the
 * given response without modification.
 *
 * @param factories An array of middleware factories to chain together
 * @param index An optional index to start the chain at. Defaults to 0.
 *
 * @returns A middleware handler that chains together the given middleware factories.
 */
export function chain(
  factories: MiddlewareFactory[],
  index = 0,
): MiddlewareHandler {
  const current = factories[index];

  if (current) {
    return current(chain(factories, index + 1));
  }

  return (_req: NextRequest, _event: NextFetchEvent, res: NextResponse) => res;
}
