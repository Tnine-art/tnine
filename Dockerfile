FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl && addgroup -S paypoint && adduser -S paypoint -G paypoint
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate
RUN npm prune --omit=dev
COPY src ./src
COPY index.html dashboard.html admin.html reset-password.html legal.html style.css scripts.js admin.js ./
USER paypoint
EXPOSE 3000
CMD ["node", "src/server.js"]
