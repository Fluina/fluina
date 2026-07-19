import { cors } from "@elysia/cors";

export const corsPlugin = cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
});