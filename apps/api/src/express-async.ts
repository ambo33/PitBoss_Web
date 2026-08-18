import express, { NextFunction, Request, Response } from 'express';

type ExpressHandler = (req: Request, res: Response, next: NextFunction) => unknown;

function wrapHandler(handler: ExpressHandler): ExpressHandler {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    try {
      const result = handler(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).catch(next);
      }
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
