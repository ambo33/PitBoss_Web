import express, { NextFunction, Request, Response } from 'express';

type RequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;
type ErrorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => unknown;
type ExpressHandler = RequestHandler | ErrorHandler;

function forwardRejectedResult(result: unknown, next: NextFunction): void {
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    void (result as Promise<unknown>).catch(next);
  }
}

function wrapHandler(handler: ExpressHandler): ExpressHandler {
  // Express identifies error middleware by its four-argument signature.
  // Preserve that arity or it will run as ordinary middleware instead.
  if (handler.length === 4) {
    return function wrappedError(
      err: unknown,
      req: Request,
      res: Response,
      next: NextFunction,
    ) {
      try {
        forwardRejectedResult((handler as ErrorHandler)(err, req, res, next), next);
      } catch (error) {
        next(error);
      }
    };
  }

  return function wrapped(req: Request, res: Response, next: NextFunction) {
    try {
      forwardRejectedResult((handler as RequestHandler)(req, res, next), next);
    } catch (error) {
      next(error);
    }
  };
}

// Express routers inherit their verb methods from the prototype of a router
// instance, not from `express.Router.prototype`. Patching the latter leaves
// async route rejections unhandled in Express 4.
const routerPrototype = Object.getPrototypeOf(express.Router()) as Record<string, (...args: unknown[]) => unknown>;

function patchRouterMethod(method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'use') {
  const original = routerPrototype[method];
  routerPrototype[method] = function patchedMethod(...args: unknown[]) {
    const wrappedArgs = args.map((arg) => typeof arg === 'function' ? wrapHandler(arg as ExpressHandler) : arg);
    return original.apply(this, wrappedArgs);
  };
}

for (const method of ['get', 'post', 'put', 'delete', 'patch', 'use'] as const) {
  patchRouterMethod(method);
}
