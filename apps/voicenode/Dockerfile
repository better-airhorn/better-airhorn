FROM node:16 as BUILD_IMAGE

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/voicenode ./apps/voicenode
COPY ./packages/entities ./packages/entities
COPY ./packages/structures ./packages/structures
COPY ./packages/audio ./packages/audio

RUN yarn workspace @better-airhorn/entities install --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc
RUN yarn workspace @better-airhorn/structures install --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc
RUN yarn workspace @better-airhorn/audio install --frozen-lockfile
RUN yarn workspace @better-airhorn/audio tsc

RUN yarn workspace voicenode install --frozen-lockfile
RUN yarn workspace voicenode tsc

RUN npm prune --production

# second image used for running
FROM node:16-alpine
COPY --from=mwader/static-ffmpeg:4.4.1 /ffmpeg /usr/local/bin/

WORKDIR /app/voicenode
COPY --from=BUILD_IMAGE /app/apps/voicenode/dist ./dist
COPY --from=BUILD_IMAGE /app/apps/voicenode/package.json .
COPY --from=BUILD_IMAGE /app/packages ./packages
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
CMD ["yarn", "run:prod"]
