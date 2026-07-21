import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";

const envSchema = t.Object({
    NODE_ENV: t.Optional(t.Union([t.Literal("development"), t.Literal("production")], { default: "development" })),
    GOOGLE_CLOUD_PROJECT: t.String({ minLength: 1, error: "GOOGLE_CLOUD_PROJECT is not Set." }),
    GOOGLE_CLOUD_LOCATION: t.Optional(t.String({ default: "global" })),
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

    return Value.Cast(envSchema, process.env);
};

export const env = checkEnv();