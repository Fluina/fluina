import { cors } from "@elysia/cors";

export const corsPlugin = cors({
    origin: [
        "https://fluina.focalrina.com",
        "http://localhost:3000",
        "http://localhost:3001"
    ],

    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
});