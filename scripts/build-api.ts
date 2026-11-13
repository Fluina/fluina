import { aot } from "elysia/plugin/aot/bun";

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "build/api",
  target: "bun",
  minify: true,
  plugins: [aot("src/app.ts", { target: "bun", strip: true })],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
}
