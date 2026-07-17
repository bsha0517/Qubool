import { io } from "socket.io-client";
import { API_BASE, getToken } from "./client.js";

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;
  socket = io(API_BASE, { auth: { token: getToken() } });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
