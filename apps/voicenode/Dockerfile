# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/voicenode/Dockerfile .
FROM mwader/static-ffmpeg:8.0.1 AS ffmpeg

FROM oven/bun:1.3.5-slim
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
WORKDIR /app

# every workspace manifest is needed for the frozen lockfile check; --filter limits the install to this app
COPY --parents package.json bun.lock apps/*/package.json packages/*/package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production --filter voicenode

# bun reads the root tsconfig for decorator metadata, which TypeORM needs
COPY tsconfig.json ./
COPY packages/audio packages/audio
COPY packages/entities packages/entities
COPY packages/structures packages/structures
COPY apps/voicenode apps/voicenode

RUN mkdir -p /data/sounds && chown bun:bun /data/sounds
VOLUME /data/sounds

USER bun
WORKDIR /app/apps/voicenode
ENV NODE_ENV=production PORT=8888 SOUNDS_DIR=/data/sounds
EXPOSE 8888
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/health`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "src/index.ts"]
