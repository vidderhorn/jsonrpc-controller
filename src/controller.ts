import { Middleware, ParameterizedContext as Context } from "koa";
import { Request, Success, Failure, Error } from "jsonrpc-types";
import getRawBody from "raw-body";

export interface Controller<S> {
  <P>(name: string): ActionBuilder<P, S>;
  route(): Middleware<S>;
}

export default function controller<S = any>(): Controller<S> {
  const actions: Actions<S> = {};
  actionBuilder.route = route;
  return actionBuilder;

  function actionBuilder<P>(name: string) {
    const action = new ActionBuilder<P, S>(name);
    actions[name] = action;
    return action;
  }

  function route(): Middleware<S> {
    return async (context, next) => {
      try {
        const raw = await getRawBody(context.req, {
          length: context.get("Content-Length"),
          limit: "1mb",
          encoding: "utf8"
        });
        const request = JSON.parse(raw) as Request;
        const action = actions[request.method];
        if (!action || !action.reply) {
          fail(context, Error.methodNotFound, request.id);
          return;
        }
        try {
          for (const filter of action.filters) {
            const pass = Promise.resolve(filter(request.params, context.state, context));
            if (!pass) {
              fail(context, Error.invalidParams, request.id);
              return;
            }
          }
          const result = await Promise.resolve(
            action.reply(request.params, context.state, context));
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

export class ActionBuilder<P, S> {
  name: string;
  balls: string[] = [];
  filters: Filter<P, S>[] = [];
  reply?: (p: P, s: S, c: Context<S>) => any;

  constructor(name: string) {
    this.name = name;
  }

  filter(filter: Filter<P, S>): ActionBuilder<P, S> {
    this.filters.push(filter);
    return this;
  }

  exec(reply: Exec<P, S>) {
    this.reply = reply;
  }
}

interface Actions<S> {
  [name: string]: ActionBuilder<any, S> | undefined
}

export type Exec<P, S> = (p: P, s: S, c: Context<S>) => any;
export type Filter<P, S> = SyncFilter<P, S> | AsyncFilter<P, S>;
export type SyncFilter<P, S> = (p: P, s: S, c: Context<S>) => boolean;
export type AsyncFilter<P, S> = (p: P, s: S, c: Context<S>) => Promise<boolean>;
