// Tighten Express's ParamsDictionary to plain string values. With Express 5
// + @types/express 5.x, req.params keys are typed as string | string[]
// which trips Prisma's strict where-clause typing. Our routes never
// register wildcard parameters (the `*` form), so a string-only Params is
// always correct.

import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
