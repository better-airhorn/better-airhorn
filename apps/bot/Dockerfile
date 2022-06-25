FROM node:16 as BUILD_IMAGE

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/bot ./apps/bot
COPY ./packages/entities ./packages/entities
COPY ./packages/structures ./packages/structures
COPY ./packages/shori ./packages/shori
COPY ./packages/audio ./packages/audio
COPY ./localization ./localization

RUN yarn workspace @better-airhorn/entities install --frozen-lockfile
RUN yarn workspace @better-airhorn/entities run build
RUN yarn workspace @better-airhorn/structures install --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc
RUN yarn workspace @better-airhorn/shori install --frozen-lockfile
RUN yarn workspace @better-airhorn/shori tsc
RUN yarn workspace @better-airhorn/audio install --frozen-lockfile
RUN yarn workspace @better-airhorn/audio tsc

RUN yarn workspace @better-airhorn/bot install --frozen-lockfile
RUN yarn workspace @better-airhorn/bot tsc

RUN npm prune --production

# second image used for running
FROM node:16-alpine
COPY --from=mwader/static-ffmpeg:4.4.1 /ffmpeg /usr/local/bin/

WORKDIR /app/bot
COPY --from=BUILD_IMAGE /app/apps/bot/dist ./dist
COPY --from=BUILD_IMAGE /app/apps/bot/package.json .
COPY --from=BUILD_IMAGE /app/packages ./packages
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
COPY --from=BUILD_IMAGE /app/localization ./files
CMD ["yarn", "run:prod"]
