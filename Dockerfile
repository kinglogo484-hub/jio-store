FROM node:20-slim
WORKDIR /app

# Build deps for better-sqlite3
RUN apt-get update -qq && apt-get install -y -qq python3 make g++ && rm -rf /var/lib/apt/lists/*

# Force fresh build layer
RUN echo "cachebuster=20260619"

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
ENV SQLITE_PATH=/data/jio_store.db
ENV UPLOADS_PATH=/data/uploads
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/server.js"]
