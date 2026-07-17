FROM node:20-slim

WORKDIR /app

# Prisma's query/schema engine binaries need a real OpenSSL present to
# detect the right version at generate-time and runtime. node:20-alpine
# (musl libc, minimal OpenSSL) causes the engine to crash with a
# non-JSON "Error load..." response instead of starting — switching to
# a Debian-based slim image and installing OpenSSL explicitly avoids
# that entirely rather than trying to patch around it.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
