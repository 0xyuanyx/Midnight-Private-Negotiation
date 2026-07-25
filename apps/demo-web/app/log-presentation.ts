import type { DemoEvent, DemoState, MessageCode } from "./demo-types";

export type SemanticTone =
  | "default"
  | "private"
  | "protocol"
  | "success"
  | "danger";

export type SemanticToken = {
  text: string;
  tone: SemanticTone;
};

const messages: Partial<Record<MessageCode, (event: DemoEvent) => string>> = {
  ROOM_JOINED: (event) =>
    `상품 코드 ${event.productCode ?? ""} 협상방에 입장했습니다.`,
  WAITING_SELLER: () => "판매자의 거래 참여를 기다리고 있습니다.",
  WAITING_BUYER: () => "구매자의 거래 참여를 기다리고 있습니다.",
  SELLER_JOINED: () => "판매자가 거래에 참여했습니다.",
  BUYER_JOINED: () => "구매자가 거래에 참여했습니다.",
  BUYER_LIMIT_LOCKED: () =>
    "구매자 조건을 로컬 비공개 상태에 저장했습니다.",
  SELLER_LIMIT_LOCKED: () =>
    "판매자 조건을 로컬 비공개 상태에 저장했습니다.",
  BUYER_COMMITMENT_CREATED: () => "구매자 가격 커밋을 생성했습니다.",
  SELLER_COMMITMENT_CREATED: () => "판매자 가격 커밋을 생성했습니다.",
  WAITING_SELLER_COMMITMENT: () =>
    "판매자 가격 커밋 등록을 기다리고 있습니다.",
  WAITING_BUYER_COMMITMENT: () =>
    "구매자 가격 커밋 등록을 기다리고 있습니다.",
  SELLER_COMMITMENT_REGISTERED: () =>
    "판매자 가격 커밋이 등록되었습니다.",
  BUYER_COMMITMENT_REGISTERED: () =>
    "구매자 가격 커밋이 등록되었습니다.",
  OBSERVER_OPEN: () => "거래 개시 · OPEN",
  NEGOTIATION_START: () => "협상을 시작합니다.",
  NEGOTIATING: () => "AI 에이전트가 비공개 협상을 진행하고 있습니다.",
  NEGOTIATION_COMPLETE: () =>
    "AI 에이전트의 비공개 협상이 완료되었습니다.",
  VERIFYING: () => "모든 조건을 공개하지 않고 증명하고 있습니다.",
  FINALIZING_SETTLEMENT: () =>
    "합의 금액을 온체인에 기록하고 있습니다.",
  FINALIZING_CANCELLATION: () =>
    "협상 결과를 온체인에 반영하고 있습니다.",
  PROOFS_COMPLETE: () => "모든 조건 증명이 완료되었습니다.",
  NEGOTIATION_SETTLED: (event) =>
    `협상 결과 · 합의 · ${Number(event.agreedAmount ?? 0).toLocaleString("ko-KR")} KRW`,
  ONCHAIN_RECORDED: () => "합의 금액이 온체인에 기록되었습니다.",
  OBSERVER_AUTHORIZED: () =>
    "가격 조건 승인 · AUTHORIZED · 금액 비공개",
  OBSERVER_SETTLED: (event) =>
    `거래 확정 · SETTLED · ${Number(event.publicAmount ?? 0).toLocaleString("ko-KR")} KRW`,
  NEGOTIATION_CANCELLED: () => "협상 결과 · 결렬",
  OBSERVER_CANCELLED: () => "거래 취소 · CANCELLED · 공개된 금액 없음",
  CHAIN_OPERATION_FAILED: () => "Midnight 거래를 완료하지 못했습니다.",
  RELAY_CHANNEL_ERROR: () => "협상 연결을 확인할 수 없습니다.",
  INVALID_RUNTIME_COMMAND: () => "DApp 명령을 처리하지 못했습니다.",
  RUNTIME_STOPPED: () => "런타임이 종료되었습니다.",
};

export const messageFor = (event: DemoEvent): string =>
  messages[event.messageCode]?.(event) ?? "";

const semanticPattern =
  /(비공개 상태|비공개 협상|금액 비공개|거래 확정|합의 · [\d,]+ KRW|[\d,]+ KRW|SETTLED|OPEN|AUTHORIZED|증명|CANCELLED|결렬)/g;

const toneFor = (text: string): SemanticTone => {
  if (
    text === "비공개 상태" ||
    text === "비공개 협상" ||
    text === "금액 비공개"
  ) {
    return "private";
  }
  if (
    text === "OPEN" ||
    text === "AUTHORIZED" ||
    text === "증명"
  ) {
    return "protocol";
  }
  if (
    text === "거래 확정" ||
    text === "SETTLED" ||
    /^합의 · [\d,]+ KRW$/.test(text) ||
    /^[\d,]+ KRW$/.test(text)
  ) {
    return "success";
  }
  if (text === "CANCELLED" || text === "결렬") {
    return "danger";
  }
  return "default";
};

export const semanticTokens = (text: string): SemanticToken[] =>
  text
    .split(semanticPattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, tone: toneFor(part) }));

export const observerStatusLabel = (
  state: DemoState | undefined,
): string => {
  switch (state) {
    case "OPEN":
      return "거래 개시 · OPEN";
    case "AUTHORIZED":
      return "조건 승인 · AUTHORIZED";
    case "SETTLED":
      return "거래 확정 · SETTLED";
    case "CANCELLED":
      return "거래 취소 · CANCELLED";
    default:
      return "대기 중";
  }
};
