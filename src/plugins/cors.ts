import { cors } from "@elysia/cors";

export const corsPlugin = cors({
    origin: process.env.NODE_ENV === "production"
        ? "https://fluina.focalrina.com"
        : "http://localhost:3000",

    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
});