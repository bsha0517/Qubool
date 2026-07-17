require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const createApp = require("./app");
const prisma = require("./config/prisma");

const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
});

// Socket auth: client connects with `auth: { token }`, we verify the JWT
// and only let the user join rooms for matches they're actually part of.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing token"));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.isBanned) return next(new Error("Unauthorized"));
    socket.userId = user.id;
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("match:join", async (matchId) => {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return;
    if (![match.userAId, match.userBId].includes(socket.userId)) return; // not your match
    socket.join(`match:${matchId}`);
  });

  socket.on("match:leave", (matchId) => {
    socket.leave(`match:${matchId}`);
  });

  socket.on("typing", ({ matchId, isTyping }) => {
    socket.to(`match:${matchId}`).emit("typing", { userId: socket.userId, isTyping });
  });
});

const app = createApp(io);
httpServer.on("request", app);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Qubool API listening on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  const redis = require("./config/redis");
  await Promise.all([prisma.$disconnect(), redis.quit()]);
  httpServer.close(() => process.exit(0));
});
