import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { jwtDecode, type JwtPayload } from "jwt-decode";
import type { MiddlewareFactory } from "../types";

export interface RefreshTokenConfig {
  /** User-supplied function that calls their API */
  refreshFn: (refreshToken: string) => Promise<{
    accessToken?: string;
    refreshToken?: string;
  } | null>;
  loginPath?: string;
  /** Cookie names — override if yours differ */
  cookieNames?: {
    accessToken?: string;
    refreshToken?: string;
  };
  cookieOptions?: {
    maxAge?: number;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
    httpOnly?: boolean;
  };
  /** Override the default expiry check */
  isExpired?: (exp?: number) => boolean;
}

const defaultIsExpired = (exp?: number): boolean => {
  if (!exp) return true;
  return Date.now() >= exp * 1000;
};

/**
 * Creates a middleware that refreshes JWT tokens when they are close to
 * expiring. The middleware will call the provided `refreshFn` with the
 * `refreshToken` cookie and expect a promise that resolves to an object
 * with `accessToken` and `refreshToken` properties.
 *
 * The middleware will also redirect to the `loginPath` if the token is
 * invalid or expired.
 *
 * @param {RefreshTokenConfig} config - Configuration for the middleware.
 * @returns {MiddlewareFactory} - A factory that wraps a "next" handler
 * and returns a new handler.
 */

export function createRefreshTokenMiddleware(
  config: RefreshTokenConfig,
): MiddlewareFactory {
  const {
    refreshFn,
    loginPath = "/login",
    cookieNames = {},
    cookieOptions = {},
    isExpired = defaultIsExpired,
  } = config;

  const {
    accessToken: accessTokenName = "accessToken",
    refreshToken: refreshTokenName = "refreshToken",
  } = cookieNames;

  const {
    maxAge = 60 * 60 * 24 * 7,
    sameSite = "lax",
    secure = true,
    httpOnly = true,
  } = cookieOptions;

  return (next) =>
    async (
      request: NextRequest,
      event: NextFetchEvent,
      response: NextResponse,
    ) => {
      const accessToken = request.cookies.get(accessTokenName)?.value;
      const refreshToken = request.cookies.get(refreshTokenName)?.value;
      const payload = accessToken ? jwtDecode<JwtPayload>(accessToken) : null;

      if (refreshToken && isExpired(payload?.exp)) {
        const tokens = await refreshFn(refreshToken);
        const opts = { httpOnly, maxAge, sameSite, secure };

        if (tokens?.accessToken && tokens?.refreshToken) {
          const res = NextResponse.next();
          res.cookies.set(accessTokenName, tokens.accessToken, opts);
          res.cookies.set(refreshTokenName, tokens.refreshToken, opts);
          return res;
        }

        const res = NextResponse.redirect(new URL(loginPath, request.url));
        res.cookies.delete(accessTokenName);
        res.cookies.delete(refreshTokenName);
        return res;
      }

      return next(request, event, response);
    };
}
