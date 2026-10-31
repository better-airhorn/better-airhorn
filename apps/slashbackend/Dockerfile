# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/slashbackend/Dockerfile .
FROM oven/bun:1.3.5-slim
WORKDIR /app

# every workspace manifest is needed for the frozen lockfile check; --filter limits the install to this app
COPY --parents package.json bun.lock apps/*/package.json packages/*/package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production --filter slashbackend

# bun reads the root tsconfig for decorator metadata, which TypeORM needs
COPY tsconfig.json ./
COPY packages/entities packages/entities
COPY packages/structures packages/structures
COPY apps/slashbackend apps/slashbackend

USER bun
WORKDIR /app/apps/slashbackend
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/health`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "src/index.ts"]
