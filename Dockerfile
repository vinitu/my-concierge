FROM node:25-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json jest.config.ts ./
COPY prompts ./prompts
COPY src ./src
COPY public ./public

RUN npm run build

FROM node:25-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prompts ./prompts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/main.js"]
