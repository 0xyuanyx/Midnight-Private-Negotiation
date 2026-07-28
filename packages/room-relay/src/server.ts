import { timingSafeEqual } from "node:crypto";
import { createServer, type Socket } from "node:net";
import {
  RELAY_PROTOCOL_VERSION,
  parseRelayClientMessage,
  type RelayError,
  type RelayPacket,
  type RelayRegistration,
} from "./index.js";
import type { PartyRole } from "@midnight-negotiation/protocol";

type ClientState = {
  socket: Socket;
  registration: RelayRegistration;
  lastSequence: number;
  seenNonces: Set<string>;
};

type RoomState = {
  productCode: string;
  clients: Partial<Record<PartyRole, ClientState>>;
};

const host = "127.0.0.1";
const requestedPort = Number(process.env.ROOM_RELAY_PORT ?? "0");
const expectedTokens: Record<PartyRole, string | undefined> = {
  buyer: process.env.BUYER_RELAY_TOKEN,
  seller: process.env.SELLER_RELAY_TOKEN,
};

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65_535 ||
  !Object.values(expectedTokens).every(
    (token) => typeof token === "string" && /^[a-f0-9]{64}$/.test(token),
  )
) {
  throw new Error("Room Relay configuration is invalid");
}

const rooms = new Map<string, RoomState>();
const clients = new Map<Socket, ClientState>();
const buffers = new Map<Socket, string>();

const send = (
  socket: Socket,
  message:
    | RelayError
    | RelayPacket
    | {
        relayProtocolVersion: typeof RELAY_PROTOCOL_VERSION;
        type: "PEER_KEY";
        sessionId: string;
        productCode: string;
        role: PartyRole;
        publicKey: string;
      },
): void => {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
};

const reject = (socket: Socket, code: RelayError["code"]): void => {
  send(socket, {
    relayProtocolVersion: RELAY_PROTOCOL_VERSION,
    type: "ERROR",
    code,
  });
};

const tokenMatches = (role: PartyRole, candidate: string): boolean => {
  const expected = expectedTokens[role];
  if (expected === undefined) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(candidate, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};

const register = (socket: Socket, registration: RelayRegistration): void => {
  if (clients.has(socket) || !tokenMatches(registration.role, registration.authToken)) {
    reject(socket, "AUTH_FAILED");
    socket.destroy();
    return;
  }
  const existingRoom = rooms.get(registration.sessionId);
  if (
    existingRoom !== undefined &&
    existingRoom.productCode !== registration.productCode
  ) {
    reject(socket, "ROOM_MISMATCH");
    socket.destroy();
    return;
  }
  const room =
    existingRoom ??
    {
      productCode: registration.productCode,
      clients: {},
    };
  if (room.clients[registration.role] !== undefined) {
    reject(socket, "ROLE_CONFLICT");
    socket.destroy();
    return;
  }
  const state: ClientState = {
    socket,
    registration,
    lastSequence: 0,
    seenNonces: new Set(),
  };
  room.clients[registration.role] = state;
  rooms.set(registration.sessionId, room);
  clients.set(socket, state);

  const peerRole: PartyRole =
    registration.role === "buyer" ? "seller" : "buyer";
  const peer = room.clients[peerRole];
  if (peer === undefined) return;
  send(socket, {
    relayProtocolVersion: RELAY_PROTOCOL_VERSION,
    type: "PEER_KEY",
    sessionId: registration.sessionId,
    productCode: registration.productCode,
    role: peerRole,
    publicKey: peer.registration.publicKey,
  });
  send(peer.socket, {
    relayProtocolVersion: RELAY_PROTOCOL_VERSION,
    type: "PEER_KEY",
    sessionId: registration.sessionId,
    productCode: registration.productCode,
    role: registration.role,
    publicKey: registration.publicKey,
  });
};

const routePacket = (socket: Socket, packet: RelayPacket): void => {
  const sender = clients.get(socket);
  if (
    sender === undefined ||
    sender.registration.role !== packet.sender ||
    sender.registration.sessionId !== packet.sessionId ||
    sender.registration.productCode !== packet.productCode
  ) {
    reject(socket, "ROOM_MISMATCH");
    return;
  }
  if (packet.sequence <= sender.lastSequence) {
    reject(socket, "REPLAY_REJECTED");
    return;
  }
  if (sender.seenNonces.has(packet.nonce)) {
    reject(socket, "NONCE_REUSED");
    return;
  }
  const room = rooms.get(packet.sessionId);
  const target = room?.clients[packet.target];
  if (target === undefined) {
    reject(socket, "PEER_UNAVAILABLE");
    return;
  }
  sender.lastSequence = packet.sequence;
  sender.seenNonces.add(packet.nonce);
  send(target.socket, packet);
};

const server = createServer((socket) => {
  socket.setEncoding("utf8");
  buffers.set(socket, "");
  socket.on("error", () => {
    // A peer can disappear between reads or while the relay is shutting down.
    // Keep the failure scoped to that connection; the close handler removes it.
  });
  socket.on("data", (chunk: string) => {
    let buffer = (buffers.get(socket) ?? "") + chunk;
    if (Buffer.byteLength(buffer, "utf8") > 32_768) {
      reject(socket, "INVALID_FRAME");
      socket.destroy();
      return;
    }
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const frame = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (frame.length === 0) continue;
      try {
        const message = parseRelayClientMessage(JSON.parse(frame) as unknown);
        if (message.type === "REGISTER") register(socket, message);
        else routePacket(socket, message);
      } catch {
        reject(socket, "INVALID_FRAME");
      }
    }
    buffers.set(socket, buffer);
  });
  socket.on("close", () => {
    buffers.delete(socket);
    const state = clients.get(socket);
    if (state === undefined) return;
    clients.delete(socket);
    const room = rooms.get(state.registration.sessionId);
    if (room === undefined) return;
    delete room.clients[state.registration.role];
    if (Object.keys(room.clients).length === 0) {
      rooms.delete(state.registration.sessionId);
    }
  });
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(requestedPort, host, () => resolve());
});

const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("Room Relay did not bind a TCP address");
}

if (process.send === undefined) {
  throw new Error("Room Relay requires an IPC parent");
}
process.send({
  relayProtocolVersion: RELAY_PROTOCOL_VERSION,
  type: "RELAY_READY",
  pid: process.pid,
  host,
  port: address.port,
});

const close = (): void => {
  for (const socket of clients.keys()) socket.destroy();
  server.close(() => process.disconnect());
};

process.once("message", (message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "SHUTDOWN_RELAY"
  ) {
    close();
  }
});
process.once("SIGTERM", close);
process.once("SIGINT", close);
