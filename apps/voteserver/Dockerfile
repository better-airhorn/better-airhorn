FROM node:16-alpine as BUILD_IMAGE

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/voteserver ./apps/voteserver
COPY ./packages/entities ./packages/entities

RUN yarn workspace @better-airhorn/entities install --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc

RUN yarn workspace voteserver install --frozen-lockfile
RUN yarn workspace voteserver tsc

RUN npm prune --production

# second image used for running
FROM node:16-alpine
COPY --from=mwader/static-ffmpeg:4.4.1 /ffmpeg /usr/local/bin/

WORKDIR /app/voicenode
COPY --from=BUILD_IMAGE /app/apps/voteserver/dist ./dist
COPY --from=BUILD_IMAGE /app/apps/voteserver/package.json .
COPY --from=BUILD_IMAGE /app/packages ./packages
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
CMD ["yarn", "run:prod"]
