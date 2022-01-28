FROM node:16
COPY --from=mwader/static-ffmpeg:4.4.1 /ffmpeg /usr/local/bin/

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/voicenode ./apps/voicenode
COPY ./packages/entities ./packages/entities
COPY ./packages/structures ./packages/structures

RUN yarn workspace @better-airhorn/entities install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc
RUN yarn workspace @better-airhorn/structures install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc

RUN yarn workspace voicenode install --production --frozen-lockfile
RUN yarn workspace voicenode tsc

WORKDIR /app/apps/voicenode
CMD ["yarn", "workspace", "voicenode", "run:prod"]