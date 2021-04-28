# jsonrpc-controller

> Small, simple TypeScript framework to create JSON-RPC 2.0 services as Koa middleware.

## Example

A controller with two methods. This includes use of [typescript-is](https://github.com/woutervh-/typescript-is) to validate incoming requests against types. This assumes the request is authenticated via an external mechanism and an `account` property exists in `State`.

```ts
import controller from "jsonrpc-controller";
import { equals } from "typescript-is";
import State from "@your_project/state";
import TaskService from "@your_project/tasks";
import { AuthzHelper } from "@your_project/helpers";

export default function taskController(tasks: TaskService, authorize: AuthzHelper) {
  const action = controller<State>;

  // action with no type checking
  action("read")
    .exec(({ id }) => tasks.get(id))

  // action with both compile-time and run-time type checking
  interface Create {
    projectId: number;
    text: string;
    position: number
  }
  action<Create>("create")
    // validate request
    .filter(create => equals<Create>(create))
    // authorize request
    .filter(authorize.createTask(projectId))
    // arbitrary filter
    .filter({ text } => text !== "play stairway to heaven")
    // do the thing
    .exec((create, { account }) => tasks.insert({
      owner: account.id,
      ...create,
    }));

  return action.routes();
}
```

An example server entrypoint:

```ts
import Koa from "koa";
import Router from "koa-router";
import Database from "@your_project/database";
import State from "@your_project/state";
import { authMiddleware } from "@your_project/middleware";
import { AuthzHelper } from "@your_project/helpers";
import taskController from "./controllers/taskController";

async function start() {
  const database = await Database.connect();
  const tasks = new TaskService(database);
  const authorize = new AuthzHelper(database);
  
  const server = new Koa<State>();
  const router = new Router<State>();
  const authenticate = authMiddleware(database);

  router.post("/api/tasks", authenticate, taskController(tasks, authorize));

  server.use(router.routes());
  server.listen(80);
}


```
