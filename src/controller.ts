import { Middleware, ParameterizedContext as Context } from "koa";
import { Request, Success, Failure, Error } from "jsonrpc-types";
import getRawBody from "raw-body";

export interface Controller<S> {
  /** Construct a method with the given names. */
  <P = any>(name: string): MethodBuilder<P, S>;
  /** Return a Koa middleware to handle method calls. */
  route(): Middleware<S>;
}

export interface Options {
  /** The byte limit of the body. This is the number of bytes or any string format supported by bytes, for example 1000, '500kb' or '3mb'. */
  maxRequestBytes: number | string | null | undefined;
}

/** Create a controller. Call the controller as a function to add a method. Call .route() to access the middleware for the controller. */
export function controller<S = any>(options?: Options): Controller<S> {
  options = Object.assign({}, controller.defaults, options);
  const methods: MethodTable<S> = {};
  methodBuilder.route = route;
  return methodBuilder;

  function methodBuilder<P>(name: string) {
    const method = new MethodBuilder<P, S>(name);
    methods[name] = method;
    return method;
  }

  function route(): Middleware<S> {
    return async (context, next) => {
      try {
        const raw = await getRawBody(context.req, {
          length: context.get("Content-Length"),
          limit: options?.maxRequestBytes,
          encoding: "utf8",
        });
        const request = JSON.parse(raw) as Request;
        const method = methods[request.method];
        if (!method || !method.reply) {
          fail(context, Error.methodNotFound, request.id);
          return;
        }
        try {
          for (const filter of method.filters) {
            const pass = Promise.resolve(filter(request.params, context.state, context));
            if (!pass) {
              fail(context, Error.invalidParams, request.id);
              return;
            }
          }
          const result = await Promise.resolve(
            method.reply(request.params, context.state, context));
          context.type = "json";
          context.body = JSON.stringify(<Success>{
            jsonrpc: "2.0",
            id: request.id,
            result
          });
        }
        catch (e) {
          console.error(e);
          fail(context, Error.internalError, request.id);
        }
      }
      catch (e) {
        fail(context, Error.parseError)
      }
    };
  }
}

export module controller {
  export let defaults: Options = {
    maxRequestBytes: "1mb",
  };
}

export default controller;

function fail(context: Context, code: number, id?: string | number) {
  context.body = JSON.stringify(<Failure>{
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: Error.message[code],
    }
  });
}

export class MethodBuilder<P, S> {
  name: string;
  balls: string[] = [];
  filters: Filter<P, S>[] = [];
  reply?: (p: P, s: S, c: Context<S>) => any;

  constructor(name: string) {
    this.name = name;
  }

  /** Filter this request. Functions returning false will cause the request to fail. */
  filter(filter: Filter<P, S>): MethodBuilder<P, S> {
    this.filters.push(filter);
    return this;
  }

  /** Execute the method. */
  exec(reply: Exec<P, S>) {
    this.reply = reply;
  }
}

interface MethodTable<S> {
  [name: string]: MethodBuilder<any, S> | undefined
}

export type Exec<P, S> = (p: P, s: S, c: Context<S>) => any;
export type Filter<P, S> = SyncFilter<P, S> | AsyncFilter<P, S>;
export type SyncFilter<P, S> = (p: P, s: S, c: Context<S>) => boolean;
export type AsyncFilter<P, S> = (p: P, s: S, c: Context<S>) => Promise<boolean>;
