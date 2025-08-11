FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/index.js"]
