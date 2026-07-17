const { PrismaClient } = require("@prisma/client");

// Single shared Prisma instance across the app (avoids exhausting
// the DB connection pool with one client per request).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;
