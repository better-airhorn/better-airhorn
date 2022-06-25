FROM node:16-alpine as BUILD_IMAGE

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/slashbackend ./apps/slashbackend
COPY ./packages/entities ./packages/entities
COPY ./packages/structures ./packages/structures
COPY ./packages/raccoon ./packages/raccoon

RUN yarn workspace @better-airhorn/entities install --frozen-lockfile
RUN yarn workspace @better-airhorn/entities tsc
RUN yarn workspace @better-airhorn/structures install --frozen-lockfile
RUN yarn workspace @better-airhorn/structures tsc
RUN yarn workspace @better-airhorn/raccoon install --frozen-lockfile
RUN yarn workspace @better-airhorn/raccoon tsc

RUN yarn workspace slashbackend install --frozen-lockfile
RUN yarn workspace slashbackend tsc

RUN npm prune --production

# second image used for running
FROM node:16-alpine
WORKDIR /app/slashbackend
COPY --from=BUILD_IMAGE /app/apps/slashbackend/dist ./dist
COPY --from=BUILD_IMAGE /app/apps/slashbackend/package.json .
COPY --from=BUILD_IMAGE /app/packages ./packages
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
CMD ["yarn", "run:prod"]
