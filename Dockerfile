FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

# Cloud Run sets $PORT; server defaults to 8080.
EXPOSE 8080

CMD ["node", "server/index.js"]
