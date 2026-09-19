# Dockerfile
#
# Single image used for both the API process and the analytics worker
# process (see docker-compose.yml "app" and "worker" services) - they share
# the exact same dependencies and code, and only differ in the command
# they run. Building one image for both avoids duplicating a second
# Dockerfile for a handful of different startup lines.

FROM node:22-alpine AS base

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]
