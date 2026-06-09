FROM node:20-alpine
WORKDIR /app

# Build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
ENV SQLITE_PATH=/data/jio_store.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server/server.js"]
