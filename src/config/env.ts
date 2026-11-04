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
  R2_ACCOUNT_ID: t.Optional(t.String({ minLength: 1 })),
  R2_ACCESS_KEY_ID: t.Optional(t.String({ minLength: 1 })),
  R2_SECRET_ACCESS_KEY: t.Optional(t.String({ minLength: 1 })),
  R2_UPLOAD_BUCKET: t.Optional(t.String({ minLength: 1 })),
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

  const r2UploadSettings = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_UPLOAD_BUCKET",
  ];
  if (
    r2UploadSettings.some((key) => process.env[key]) &&
    r2UploadSettings.some((key) => !process.env[key])
  ) {
    console.error(
      `${r2UploadSettings.join(", ")} must be configured together.`,
    );
    process.exit(1);
  }

  return Value.Cast(envSchema, process.env);
};

export const env = checkEnv();
