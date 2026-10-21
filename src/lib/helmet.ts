import * as helmetModule from "helmet";

import type { RequestHandler } from "express";
import type { HelmetOptions } from "helmet";

// The runtime default export is a function, as verified
// with Node.js. This assertion works around TypeScript's
// incorrect module namespace interpretation.
const helmetFactory = helmetModule.default as unknown as (
  options?: HelmetOptions,
) => RequestHandler;

export function createHelmetMiddleware(
  options?: HelmetOptions,
): RequestHandler {
  return helmetFactory(options);
}
