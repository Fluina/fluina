import { Elysia } from "elysia";
import { corsPlugin } from "./plugins/cors";
import { askController } from "./modules/ask/controller";

const app = new Elysia()
    .use(corsPlugin)
    .group("/api", (api) =>
        api
            .use(askController)
    )
    .listen(3001);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;