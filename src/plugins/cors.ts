import { cors } from "@elysia/cors";

const allowedOrigins = [
  "https://fluina.focalrina.com",
  "http://localhost:3000",
];
const vercelPreviewOrigin =
  /^https:\/\/fluina-[a-z0-9-]+-focalrina\.vercel\.app$/;

export const corsPlugin = cors({
  origin: (request) => {
    const origin = request.headers.get("origin");

    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      vercelPreviewOrigin.test(origin)
    ) {
      return true;
    }

    return false;
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
