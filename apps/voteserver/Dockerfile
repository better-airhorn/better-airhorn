FROM node:16-alpine as BUILD_IMAGE

WORKDIR /app
COPY ./package.json .
COPY ./yarn.lock .
COPY ./tsconfig.json .

COPY ./apps/voteserver ./apps/voteserver
COPY ./packages/entities ./packages/entities

RUN yarn workspace @better-airhorn/entities install --frozen-lockfile \
    && yarn workspace @better-airhorn/entities tsc \
    && yarn workspace voteserver install --frozen-lockfile \
    && yarn workspace voteserver tsc \
    && npm prune --production \
    # copy node_modules from voteserver to root node_modules (because of tslib)
    && cp -r ./apps/voteserver/node_modules/* ./node_modules

# second image used for running
FROM node:16-alpine
WORKDIR /app/voteserver
COPY --from=BUILD_IMAGE /app/apps/voteserver/dist ./dist
COPY --from=BUILD_IMAGE /app/apps/voteserver/package.json .
COPY --from=BUILD_IMAGE /app/packages ./packages
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
CMD ["yarn", "run:prod"]
