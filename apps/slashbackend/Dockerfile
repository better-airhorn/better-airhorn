FROM node:16-alpine

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/slashbackend ./apps/slashbackend
COPY ./packages/entities ./packages/entities
COPY ./packages/structures ./packages/structures

RUN yarn workspace @better-airhorn/entities install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc
RUN yarn workspace @better-airhorn/structures install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc

RUN yarn workspace slashbackend install --production --frozen-lockfile
RUN yarn workspace slashbackend tsc

WORKDIR /app/apps/slashbackend
CMD ["yarn", "workspace", "slashbackend", "run:prod"]