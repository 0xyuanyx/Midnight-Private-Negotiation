"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LockKeyhole, RotateCcw } from "lucide-react";
import Image from "next/image";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DemoEvent,
  type PanelId,
  type RoleId,
  type ServerMessage,
} from "./demo-types";
import {
  messageFor,
  observerStatusLabel,
  semanticTokens,
} from "./log-presentation";

type EntryPhase = "code" | "limit" | "locked";

type RoleEntry = {
  phase: EntryPhase;
  code: string;
  amountInput: string;
  amount: number | null;
  error: string;
  pending: boolean;
  promptedAt: string;
};

const initialEntry = (promptedAt: string): RoleEntry => ({
  phase: "code",
  code: "",
  amountInput: "",
  amount: null,
  error: "",
  pending: false,
  promptedAt,
});

const spinningMessages = new Set<DemoEvent["messageCode"]>([
  "WAITING_SELLER",
  "WAITING_BUYER",
  "WAITING_SELLER_COMMITMENT",
  "WAITING_BUYER_COMMITMENT",
  "NEGOTIATION_START",
  "NEGOTIATING",
  "VERIFYING",
  "FINALIZING_SETTLEMENT",
  "FINALIZING_CANCELLATION",
]);

const timeLabel = (occurredAt: string): string =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(occurredAt));

const formatAmount = (digits: string): string => {
  if (digits.length === 0) return "";
  return Number(digits).toLocaleString("ko-KR");
};

const eventKey = (event: DemoEvent): string =>
  `${event.panel}:${event.eventId}`;

function SpinnerGlyph() {
  return <span className="terminal-spinner" aria-hidden="true" />;
}

function SemanticMessage({ text }: { text: string }) {
  return (
    <>
      {semanticTokens(text).map(({ text: token, tone }, index) =>
        tone === "default" ? (
          token
        ) : (
          <span className={`token-${tone}`} key={`${token}-${index}`}>
            {token}
          </span>
        ),
      )}
    </>
  );
}

function LogLine({
  event,
  isActive,
}: {
  event: DemoEvent;
  isActive: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const message = messageFor(event);

  return (
    <motion.li
      layout="position"
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="terminal-line"
    >
      <time dateTime={event.occurredAt} className="terminal-time">
        [{timeLabel(event.occurredAt)}]
      </time>
      <span className="terminal-message">
        <SemanticMessage text={message} />
        {spinningMessages.has(event.messageCode) && isActive ? (
          <SpinnerGlyph />
        ) : null}
      </span>
    </motion.li>
  );
}

function RoleStatus({ role, entry }: { role: RoleId; entry: RoleEntry }) {
  const label =
    role === "buyer" ? "구매자 최대 한도" : "판매자 최소 금액";

  if (entry.phase === "code") {
    return (
      <div className="status-line">
        <span>상품 코드</span>
        <span className="status-bracket">[</span>
        <span className="status-placeholder">_ _ _ _</span>
        <span className="status-bracket">]</span>
      </div>
    );
  }

  return (
    <div className="status-line">
      <span className="room-code">{entry.code}</span>
      <span className="control-separator" aria-hidden="true">
        ·
      </span>
      <span className="control-label">{label}</span>
      {entry.phase === "locked" && entry.amount !== null ? (
        <>
          <span
            className="lock-mark"
            aria-label="역할별 로컬 비공개 상태에 저장됨"
          >
            <LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <output className="locked-amount">
            {entry.amount.toLocaleString("ko-KR")}
          </output>
        </>
      ) : (
        <span className="status-empty" aria-label="금액 입력 대기" />
      )}
      <span className="currency">KRW</span>
    </div>
  );
}

function ObserverStatus({ events }: { events: DemoEvent[] }) {
  const lastState = events.at(-1)?.state;
  const label = observerStatusLabel(lastState);

  return (
    <div className="status-line">
      <span>공개 계약 상태</span>
      <span className="control-separator" aria-hidden="true">
        ·
      </span>
      <span className="observer-state">
        <SemanticMessage text={label} />
      </span>
    </div>
  );
}

function EntryPrompt({
  role,
  entry,
  onCodeChange,
  onCodeSubmit,
  onLimitChange,
  onLimitSubmit,
}: {
  role: RoleId;
  entry: RoleEntry;
  onCodeChange: (value: string) => void;
  onCodeSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLimitChange: (value: string) => void;
  onLimitSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (entry.phase === "locked") return null;

  const isCode = entry.phase === "code";
  const privateLabel =
    role === "buyer" ? "구매자 최대 한도" : "판매자 최소 금액";

  return (
    <motion.li
      key={`${role}-${entry.phase}-${entry.promptedAt}`}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="entry-prompt"
    >
      <form
        onSubmit={isCode ? onCodeSubmit : onLimitSubmit}
        className="entry-form"
        noValidate
      >
        <div className="terminal-line prompt-message">
          <time dateTime={entry.promptedAt} className="terminal-time">
            [{timeLabel(entry.promptedAt)}]
          </time>
          <span className="terminal-message">
            {isCode ? (
              "상품 코드를 입력해 주세요."
            ) : (
              <>
                <span className="token-private">{privateLabel}</span>
                {role === "buyer" ? "를" : "을"} 입력해 주세요.
              </>
            )}
          </span>
        </div>
        <div className="prompt-input-row">
          <span className="prompt-caret" aria-hidden="true">
            &gt;
          </span>
          <input
            id={`${role}-${isCode ? "product-code" : "limit"}`}
            name={`${role}-${isCode ? "product-code" : "limit"}`}
            aria-label={isCode ? `${role} 상품 코드` : privateLabel}
            aria-describedby={entry.error ? `${role}-entry-error` : undefined}
            aria-invalid={Boolean(entry.error)}
            className={`prompt-input ${isCode ? "code-input" : "amount-input"}`}
            type="text"
            inputMode="numeric"
            autoComplete={isCode ? "one-time-code" : "transaction-amount"}
            disabled={entry.pending}
            maxLength={isCode ? 4 : undefined}
            value={isCode ? entry.code : formatAmount(entry.amountInput)}
            onChange={(event) =>
              isCode
                ? onCodeChange(event.target.value)
                : onLimitChange(event.target.value)
            }
          />
          <button className="sr-only" type="submit" disabled={entry.pending}>
            입력 완료
          </button>
        </div>
        <div
          id={`${role}-entry-error`}
          className="input-error"
          role={entry.error ? "alert" : undefined}
        >
          {entry.error}
        </div>
      </form>
    </motion.li>
  );
}

function TerminalPanel({
  panel,
  title,
  statusLine,
  prompt,
  promptKey,
  events,
  connected,
}: {
  panel: PanelId;
  title: string;
  statusLine?: ReactNode;
  prompt?: ReactNode;
  promptKey?: string;
  events: DemoEvent[];
  connected: boolean;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const lastState = events.at(-1)?.state;
  const latestEventByReplaceKey = useMemo(() => {
    const latest = new Map<string, string>();
    for (const event of events) {
      if (event.replaceKey !== undefined) {
        latest.set(event.replaceKey, event.eventId);
      }
    }
    return latest;
  }, [events]);

  useEffect(() => {
    const element = logRef.current;
    if (element === null) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [events, promptKey]);

  const status =
    lastState === "SETTLED"
      ? "settled"
      : lastState === "CANCELLED" || lastState === "ERROR"
        ? "error"
        : connected
          ? "active"
          : "idle";

  return (
    <section
      className={`terminal-panel panel-${panel}`}
      aria-labelledby={`${panel}-heading`}
    >
      <header className="panel-header">
        <h2 id={`${panel}-heading`}>{title}</h2>
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span className="sr-only">
          {status === "settled"
            ? "완료"
            : status === "error"
              ? "중단"
              : status === "active"
                ? "연결됨"
                : "연결 대기"}
        </span>
      </header>
      {statusLine === undefined ? null : (
        <div className="panel-status">{statusLine}</div>
      )}
      <div className="panel-body" ref={logRef}>
        <ol className="terminal-log" aria-live="polite" aria-atomic="false">
          <AnimatePresence initial={false}>
            {events.map((event) =>
              messageFor(event).length === 0 ? null : (
                <LogLine
                  event={event}
                  isActive={
                    event.replaceKey === undefined ||
                    latestEventByReplaceKey.get(event.replaceKey) ===
                      event.eventId
                  }
                  key={eventKey(event)}
                />
              ),
            )}
            {prompt}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}

export function NegotiationDapp({ initialNow }: { initialNow: string }) {
  const [ready, setReady] = useState(false);
  const [buyer, setBuyer] = useState<RoleEntry>(() => initialEntry(initialNow));
  const [seller, setSeller] = useState<RoleEntry>(() =>
    initialEntry(initialNow),
  );
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRequests = useRef(new Map<string, RoleId>());

  const updateEntry = useCallback(
    (role: RoleId, updater: (entry: RoleEntry) => RoleEntry) => {
      if (role === "buyer") {
        setBuyer(updater);
      } else {
        setSeller(updater);
      }
    },
    [],
  );

  const upsertEvent = useCallback((event: DemoEvent) => {
    setEvents((current) => {
      const key = eventKey(event);
      if (current.some((item) => eventKey(item) === key)) return current;
      return [...current, event];
    });
  }, []);

  const acceptEvent = useCallback(
    (event: DemoEvent) => {
      upsertEvent(event);
      if (event.panel === "observer") return;

      if (event.state === "ROOM_JOINED") {
        updateEntry(event.panel, (entry) => ({
          ...entry,
          phase: "limit",
          code: event.productCode ?? entry.code,
          error: "",
          pending: false,
          promptedAt: event.occurredAt,
        }));
      }
      if (event.state === "LIMIT_LOCKED") {
        updateEntry(event.panel, (entry) => ({
          ...entry,
          phase: "locked",
          amount: Number(entry.amountInput),
          error: "",
          pending: false,
        }));
      }
    },
    [updateEntry, upsertEvent],
  );

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "READY":
          setReady(true);
          return;
        case "DEMO_EVENT":
          acceptEvent(message.event);
          return;
        case "COMMAND_ACCEPTED": {
          const role = pendingRequests.current.get(message.requestId);
          if (role !== undefined) {
            pendingRequests.current.delete(message.requestId);
            updateEntry(role, (entry) => ({ ...entry, pending: false }));
          }
          return;
        }
        case "ERROR": {
          const role =
            message.requestId === undefined
              ? undefined
              : pendingRequests.current.get(message.requestId);
          if (role !== undefined) {
            pendingRequests.current.delete(message.requestId as string);
            updateEntry(role, (entry) => ({
              ...entry,
              pending: false,
              error: message.message,
            }));
          }
          return;
        }
        case "RESET_COMPLETE":
          return;
      }
    },
    [acceptEvent, updateEntry],
  );

  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_DEMO_WS_URL ?? "ws://127.0.0.1:8787";
    let disposed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.addEventListener("message", (event) => {
        try {
          handleServerMessage(JSON.parse(String(event.data)) as ServerMessage);
        } catch {
          setReady(false);
        }
      });
      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        setReady(false);
        if (!disposed) retryTimer = window.setTimeout(connect, 700);
      });
      socket.addEventListener("error", () => setReady(false));
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [handleServerMessage]);

  const sendCommand = (
    role: RoleId,
    command:
      | { type: "JOIN_ROOM"; productCode: string }
      | { type: "SET_LIMIT"; limitKrw: string },
  ): boolean => {
    const socket = socketRef.current;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      updateEntry(role, (entry) => ({
        ...entry,
        error: "DApp Controller 연결을 기다리고 있습니다.",
      }));
      return false;
    }
    const requestId = crypto.randomUUID();
    pendingRequests.current.set(requestId, role);
    socket.send(JSON.stringify({ ...command, requestId, role }));
    updateEntry(role, (entry) => ({
      ...entry,
      pending: true,
      error: "",
    }));
    return true;
  };

  const changeCode = (role: RoleId, value: string) => {
    const code = value.replace(/\D/g, "").slice(0, 4);
    updateEntry(role, (entry) => ({ ...entry, code, error: "" }));
  };

  const submitCode = (role: RoleId, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entry = role === "buyer" ? buyer : seller;
    if (!/^\d{4}$/.test(entry.code)) {
      updateEntry(role, (current) => ({
        ...current,
        error: "상품 코드는 숫자 네 자리로 입력해 주세요.",
      }));
      return;
    }
    sendCommand(role, { type: "JOIN_ROOM", productCode: entry.code });
  };

  const changeLimit = (role: RoleId, value: string) => {
    const amountInput = value.replace(/\D/g, "").slice(0, 12);
    updateEntry(role, (entry) => ({ ...entry, amountInput, error: "" }));
  };

  const submitLimit = (role: RoleId, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entry = role === "buyer" ? buyer : seller;
    const amount = Number(entry.amountInput);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      updateEntry(role, (current) => ({
        ...current,
        error: "한도 금액은 1 KRW 이상의 정수로 입력해 주세요.",
      }));
      return;
    }
    sendCommand(role, { type: "SET_LIMIT", limitKrw: entry.amountInput });
  };

  const reset = () => {
    const promptedAt = new Date().toISOString();
    const socket = socketRef.current;
    setBuyer(initialEntry(promptedAt));
    setSeller(initialEntry(promptedAt));
    setEvents([]);
    pendingRequests.current.clear();
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      setReady(false);
      socket.send(
        JSON.stringify({
          type: "RESET_DEMO",
          requestId: crypto.randomUUID(),
        }),
      );
    }
  };

  const panelEvents = useMemo(
    () => ({
      buyer: events.filter((event) => event.panel === "buyer"),
      seller: events.filter((event) => event.panel === "seller"),
      observer: events.filter((event) => event.panel === "observer"),
    }),
    [events],
  );

  const hasStarted =
    buyer.code.length > 0 || seller.code.length > 0 || events.length > 0;

  return (
    <main className="demo-shell">
      <header className="page-header">
        <div className="brand-lockup">
          <Image
            className="brand-logo"
            src="/brand/midnight-horizontal-white.svg"
            alt="MIDNIGHT"
            width={111}
            height={24}
            priority
          />
          <span className="brand-divider" aria-hidden="true" />
          <h1>비공개 협상 데모</h1>
        </div>
        {hasStarted ? (
          <button className="reset-button" type="button" onClick={reset}>
            <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
            초기화
          </button>
        ) : null}
      </header>

      <div className="terminal-grid">
        <TerminalPanel
          panel="buyer"
          title="BUYER"
          events={panelEvents.buyer}
          connected={ready}
          statusLine={ready ? <RoleStatus role="buyer" entry={buyer} /> : undefined}
          promptKey={`${buyer.phase}-${buyer.promptedAt}-${ready}`}
          prompt={
            ready ? (
              <EntryPrompt
                role="buyer"
                entry={buyer}
                onCodeChange={(value) => changeCode("buyer", value)}
                onCodeSubmit={(event) => submitCode("buyer", event)}
                onLimitChange={(value) => changeLimit("buyer", value)}
                onLimitSubmit={(event) => submitLimit("buyer", event)}
              />
            ) : undefined
          }
        />
        <TerminalPanel
          panel="seller"
          title="SELLER"
          events={panelEvents.seller}
          connected={ready}
          statusLine={
            ready ? <RoleStatus role="seller" entry={seller} /> : undefined
          }
          promptKey={`${seller.phase}-${seller.promptedAt}-${ready}`}
          prompt={
            ready ? (
              <EntryPrompt
                role="seller"
                entry={seller}
                onCodeChange={(value) => changeCode("seller", value)}
                onCodeSubmit={(event) => submitCode("seller", event)}
                onLimitChange={(value) => changeLimit("seller", value)}
                onLimitSubmit={(event) => submitLimit("seller", event)}
              />
            ) : undefined
          }
        />
        <TerminalPanel
          panel="observer"
          title="OBSERVER"
          events={panelEvents.observer}
          connected={ready && panelEvents.observer.length > 0}
          statusLine={
            ready ? <ObserverStatus events={panelEvents.observer} /> : undefined
          }
        />
      </div>
    </main>
  );
}
