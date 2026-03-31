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
  publicRoutes?: string[];
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
    publicRoutes = ["/login"],
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

  return (next) => async (request: NextRequest, event: NextFetchEvent) => {
    const { pathname } = request.nextUrl;
    const accessToken = request.cookies.get(accessTokenName)?.value;
    const refreshToken = request.cookies.get(refreshTokenName)?.value;
    const payload = accessToken ? jwtDecode<JwtPayload>(accessToken) : null;
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, max-age=0, s-maxage=0");
    const isPublic = publicRoutes.some((route) => pathname.startsWith(route));
    const clearCookies = () => {
      response.cookies.delete(accessTokenName);
      response.cookies.delete(refreshTokenName);
    };

    if (!refreshToken) {
      clearCookies();

      if (!isPublic) {
        return NextResponse.redirect(new URL(loginPath, request.url));
      }

      return next(request, event, response);
    }

    if (refreshToken && isExpired(payload?.exp)) {
      try {
        const tokens = await refreshFn(refreshToken);

        if (tokens?.accessToken && tokens?.refreshToken) {
          const opts = { httpOnly, maxAge, sameSite, secure };
          response.cookies.set(accessTokenName, tokens.accessToken, opts);
          response.cookies.set(refreshTokenName, tokens.refreshToken, opts);
          return response;
        }
        throw new Error("Invalid tokens");
      } catch (error) {
        clearCookies();
        if (!isPublic) {
          return NextResponse.redirect(new URL(loginPath, request.url));
        }
        return response;
      }
    }

    return next(request, event, response);
  };
}
