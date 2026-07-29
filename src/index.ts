import { Elysia } from "elysia";
import { askController } from "./modules/ask/controller";
import { corsPlugin } from "./plugins/cors";

const port = Number(process.env.PORT) || 3001;

const app = new Elysia()
  .use(corsPlugin)
  .group("/api", (api) => api.use(askController))
  .listen({
    port: port,
    hostname: "0.0.0.0",
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
