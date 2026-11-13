FROM oven/bun:1.4.4

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:api

EXPOSE 3001

CMD ["bun", "run", "build/api/index.js"]