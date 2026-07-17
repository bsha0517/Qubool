FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install prisma --no-save

COPY . .

RUN npx prisma generate

EXPOSE 4000

# Runs pending migrations before starting — safe to run on every deploy,
# a no-op if the schema is already up to date. Platforms that let you
# override the start command (see backend/railway.json) can still do so;
# this is just a sane default for anything that just runs the Dockerfile as-is.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
