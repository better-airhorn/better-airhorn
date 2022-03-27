FROM node:16

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/voteserver ./apps/voteserver
COPY ./packages/entities ./packages/entities

RUN yarn workspace @better-airhorn/entities install --production --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc

RUN yarn workspace voteserver install --production --frozen-lockfile
RUN yarn workspace voteserver tsc

WORKDIR /app/apps/voteserver
CMD ["yarn", "workspace", "voteserver", "run:prod"]