import { Elysia } from "elysia";
import { askController } from "./modules/ask/controller";
import { corsPlugin } from "./plugins/cors";

export const app = new Elysia({ name: "fluina-api" })
  .use(corsPlugin)
  .group("/api", (api) => api.use(askController));

export type App = typeof app;
