import { WebSocket, WebSocketServer } from "ws";
import {
  createRequestId,
  type PartyRole,
} from "@midnight-negotiation/protocol";
import { isBrowserDisplayEvent } from "./display-policy.js";
import { IsolatedRuntimeController } from "./orchestrator.js";
import { createRoomSessionId } from "./session-id.js";

type ClientCommand =
  | {
      type: "JOIN_ROOM";
      requestId: string;
      role: PartyRole;
      productCode: string;
    }
  | {
      type: "SET_LIMIT";
      requestId: string;
      role: PartyRole;
      limitKrw: string;
    }
  | {
      type: "RESET_DEMO";
      requestId: string;
    };

type ServerMessage =
  | { type: "READY" }
  | {
      type: "COMMAND_ACCEPTED";
      requestId: string;
      command: ClientCommand["type"];
      role?: PartyRole;
    }
  | {
      type: "DEMO_EVENT";
      event: import("@midnight-negotiation/protocol").DemoEvent;
    }
  | { type: "RESET_COMPLETE" }
  | { type: "ERROR"; requestId?: string; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseClientCommand = (raw: string): ClientCommand => {
  const value = JSON.parse(raw) as unknown;
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.requestId)
  ) {
    throw new Error("잘못된 명령 형식입니다.");
  }

  if (value.type === "RESET_DEMO") {
    if (Object.keys(value).some((key) => !["type", "requestId"].includes(key))) {
      throw new Error("잘못된 초기화 명령입니다.");
    }
    return value as ClientCommand;
  }

  if (value.role !== "buyer" && value.role !== "seller") {
    throw new Error("Buyer 또는 Seller 역할이 필요합니다.");
  }
  if (value.type === "JOIN_ROOM") {
    if (
      typeof value.productCode !== "string" ||
      !/^\d{4}$/.test(value.productCode)
    ) {
      throw new Error("상품 코드는 숫자 네 자리로 입력해 주세요.");
    }
    return value as ClientCommand;
  }
  if (value.type === "SET_LIMIT") {
    if (
      typeof value.limitKrw !== "string" ||
      !/^[1-9]\d{0,18}$/.test(value.limitKrw)
    ) {
      throw new Error("한도 금액은 1 KRW 이상의 정수로 입력해 주세요.");
    }
    return value as ClientCommand;
  }
  throw new Error("지원하지 않는 명령입니다.");
};

const port = Number(process.env.DEMO_WS_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("DEMO_WS_PORT must be a valid TCP port");
}

const sockets = new Set<WebSocket>();
const roleSessions = new Map<PartyRole, string>();
let controller: IsolatedRuntimeController;
let unsubscribeEvent: (() => void) | undefined;
let unsubscribeError: (() => void) | undefined;
let resetting = false;

const encode = (message: ServerMessage): string => JSON.stringify(message);

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === WebSocket.OPEN) socket.send(encode(message));
};

const broadcast = (message: ServerMessage): void => {
  for (const socket of sockets) send(socket, message);
};

const attachController = async (): Promise<void> => {
  controller = new IsolatedRuntimeController();
  unsubscribeEvent = controller.onDemoEvent((event) => {
    if (!isBrowserDisplayEvent(event)) return;
    broadcast({ type: "DEMO_EVENT", event });
  });
  unsubscribeError = controller.onControllerError(() => {
    broadcast({
      type: "ERROR",
      message: "DApp 상태 처리 중 오류가 발생했습니다.",
    });
  });
  await controller.start();
};

const resetController = async (): Promise<void> => {
  if (resetting) return;
  resetting = true;
  try {
    unsubscribeEvent?.();
    unsubscribeError?.();
    await controller.shutdown();
    roleSessions.clear();
    await attachController();
    broadcast({ type: "RESET_COMPLETE" });
    broadcast({ type: "READY" });
  } finally {
    resetting = false;
  }
};

await attachController();

const webSocketServer = new WebSocketServer({
  host: "127.0.0.1",
  port,
});

webSocketServer.on("connection", (socket) => {
  const demoInstanceId = createRequestId();
  sockets.add(socket);
  send(socket, { type: "READY" });

  socket.on("message", async (data) => {
    let command: ClientCommand | undefined;
    try {
      command = parseClientCommand(data.toString());
      if (command.type === "RESET_DEMO") {
        await resetController();
        return;
      }

      if (command.type === "JOIN_ROOM") {
        const sessionId = createRoomSessionId(
          command.productCode,
          demoInstanceId,
        );
        roleSessions.set(command.role, sessionId);
        controller.joinRoom(command.role, {
          sessionId,
          productCode: command.productCode,
        });
      } else {
        const sessionId = roleSessions.get(command.role);
        if (sessionId === undefined) {
          throw new Error("먼저 상품 코드를 입력해 주세요.");
        }
        controller.setLimit(command.role, {
          sessionId,
          limitKrw: command.limitKrw,
        });
      }

      send(socket, {
        type: "COMMAND_ACCEPTED",
        requestId: command.requestId,
        command: command.type,
        role: command.role,
      });
    } catch (error) {
      send(socket, {
        type: "ERROR",
        ...(command === undefined ? {} : { requestId: command.requestId }),
        message:
          error instanceof Error
            ? error.message
            : "DApp 명령을 처리하지 못했습니다.",
      });
    }
  });

  socket.on("close", () => sockets.delete(socket));
});

const close = async (): Promise<void> => {
  for (const socket of sockets) socket.close();
  await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  unsubscribeEvent?.();
  unsubscribeError?.();
  await controller.shutdown();
};

process.once("SIGINT", () => {
  void close().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void close().finally(() => process.exit(0));
});

console.log(`Demo Controller WebSocket ready at ws://127.0.0.1:${port}`);
