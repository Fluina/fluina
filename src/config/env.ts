import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";

const envSchema = t.Object({
  NODE_ENV: t.Optional(
    t.Union(
      [t.Literal("development"), t.Literal("production"), t.Literal("test")],
      { default: "development" },
    ),
  ),
  OPENROUTER_API_KEY: t.String({
    minLength: 1,
    error: "OPENROUTER_API_KEY is not Set.",
  }),
  OPENROUTER_MODEL: t.Optional(
    t.String({ default: "openrouter/free", minLength: 1 }),
  ),
  MANIM_RENDERER_URL: t.Optional(t.String({ format: "uri" })),
  MANIM_RENDERER_TOKEN: t.Optional(t.String({ minLength: 16 })),
});

const checkEnv = () => {
  if (!Value.Check(envSchema, process.env)) {
    const errors = [...Value.Errors(envSchema, process.env)];

    console.error("Environment Variable Settings are Invalid:");

    for (const error of errors) {
      console.error(`  - ${error.path}: ${error.message}`);
    }

    process.exit(1);
  }

  if (
    Boolean(process.env.MANIM_RENDERER_URL) !==
    Boolean(process.env.MANIM_RENDERER_TOKEN)
  ) {
    console.error(
      "MANIM_RENDERER_URL and MANIM_RENDERER_TOKEN must be configured together.",
    );
    process.exit(1);
  }

  return Value.Cast(envSchema, process.env);
};

export const env = checkEnv();
