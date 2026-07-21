import { cors } from "@elysia/cors";

const allowedOrigins = [
    "https://fluina.focalrina.com",
    "http://localhost:3000",
];

export const corsPlugin = cors({
    origin: (request) => {
        const origin = request.headers.get("origin");

        if (!origin || allowedOrigins.includes(origin)) {
            return true;
        }

        return false;
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
});