import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import type { MiddlewareFactory } from "../types";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  level?: LogLevel;
  /** Custom log handler — defaults to console */
  logFn?: (entry: LogEntry) => void;
  /** Filter which paths get logged. Default: log everything */
  filter?: (request: NextRequest) => boolean;
}

export interface LogEntry {
  timestamp: string;
  method: string;
  pathname: string;
  status?: number;
  durationMs: number;
  ip?: string;
}

const defaultLogFn = (level: LogLevel) => (entry: LogEntry) => {
  const { timestamp, method, pathname, durationMs, status, ip } = entry;
  const line = `[${timestamp}] ${method} ${pathname} ${status ?? "-"} ${durationMs}ms ${ip ? `(${ip})` : ""}`;
  console[level](line);
};

/**
 * Creates a middleware that logs requests and responses.
 * @param config - Configuration options
 * @param {LogLevel} config.level - The log level (debug, info, warn, error)
 * @param {(entry: LogEntry) => void} config.logFn - Custom log handler
 * @param {(request: NextRequest) => boolean} config.filter - Filter which paths get logged
 * @returns {MiddlewareFactory} - A middleware factory
 */
export function createLoggerMiddleware(
  config: LoggerConfig = {},
): MiddlewareFactory {
  const {
    level = "info",
    logFn = defaultLogFn(level),
    filter = () => true,
  } = config;

  return (next) =>
    async (
      request: NextRequest,
      event: NextFetchEvent,
      response: NextResponse,
    ) => {
      if (!filter(request)) return next(request, event, response);

      const start = Date.now();
      const result = await next(request, event, response);
      const durationMs = Date.now() - start;

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        method: request.method,
        pathname: request.nextUrl.pathname,
        durationMs,
      };

      if (result instanceof NextResponse) {
        logEntry.status = result.status;
      }

      const ipValue =
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip");
      if (ipValue) {
        logEntry.ip = ipValue;
      }

      logFn(logEntry);

      return result;
    };
}
