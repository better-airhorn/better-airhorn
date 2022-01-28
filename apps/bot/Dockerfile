FROM node:16
COPY --from=mwader/static-ffmpeg:4.4.1 /ffmpeg /usr/local/bin/

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

RUN yarn workspace @better-airhorn/entities install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/entities run build
RUN yarn workspace @better-airhorn/structures install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc
RUN yarn workspace @better-airhorn/shori install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/shori tsc
RUN yarn workspace @better-airhorn/audio install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/audio tsc

RUN yarn workspace @better-airhorn/bot install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/bot tsc

WORKDIR /app/apps/bot
CMD ["yarn", "workspace", "@better-airhorn/bot", "run:prod"]