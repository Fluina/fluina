import { app } from "./app";

const port = Number(process.env.PORT) || 3001;

const server = app.listen({
  port,
  hostname: "0.0.0.0",
});

console.log(
  `🦊 Elysia is running at ${server.server?.hostname}:${server.server?.port}`,
);

export type { App } from "./app";
export { app } from "./app";
