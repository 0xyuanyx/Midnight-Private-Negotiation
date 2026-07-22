#!/usr/bin/env python3
"""Two-terminal De-Butler negotiation demo.

This is a learning prototype for the presentation flow. It does not call
Midnight yet; the two [Mock ZK] messages mark where the real contract calls
will be connected later.

Run in three terminals:
  python3 python_demo.py relay
  python3 python_demo.py  # run once as buyer and once as seller
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import socketserver
import sys
import time
from dataclasses import dataclass
from typing import Any

HOST = "127.0.0.1"
PORT = int(os.environ.get("DEBUTLER_DEMO_PORT", "8765"))


def money(value: int | str) -> str:
    return f"{int(value):,}"


def short_commitment(value: str) -> str:
    normalized = value[2:] if value.startswith("0x") else value
    return f"0x{normalized[:4]}…"


def public_event_from_message(message: dict[str, Any], block: int) -> dict[str, Any] | None:
    message_type = message.get("type")
    if message_type == "CREATE_DEAL":
        return {
            "event": "DEAL_CREATED",
            "block": block,
            "deal_id": message.get("deal_id", message.get("product", "unknown")),
            "commitment": short_commitment(message["buyer_commitment"]),
        }
    if message_type == "DEAL_JOINED":
        return {
            "event": "SELLER_JOINED",
            "block": block,
            "commitment": short_commitment(message["seller_commitment"]),
        }
    if message_type == "AUTHORIZED":
        return {
            "event": "PRICE_COMMITTED",
            "block": block,
            "commitment": short_commitment(message["price_commitment"]),
        }
    if message_type == "SETTLED":
        return {"event": "SETTLED", "block": block, "price": int(message["price"])}
    if message_type == "CANCEL":
        return {"event": "CANCELLED", "block": block}
    return None


def render_public_event(event: dict[str, Any]) -> str:
    block = event["block"]
    event_type = event["event"]
    if event_type == "DEAL_CREATED":
        return f"[block {block}] DEAL#{event['deal_id']} created — C_B: {event['commitment']}"
    if event_type == "SELLER_JOINED":
        return f"[block {block}] C_S registered — {event['commitment']}"
    if event_type == "PRICE_COMMITTED":
        return f"[block {block}] C_P registered — {event['commitment']}"
    if event_type == "SETTLED":
        return f"[block {block}] SETTLED: {money(event['price'])} KRW"
    if event_type == "CANCELLED":
        return f"[block {block}] CANCELLED — 공개된 값: 없음"
    raise ValueError(f"unknown public event: {event_type}")


def read_money(prompt: str) -> int:
    while True:
        try:
            value = int(input(prompt).replace(",", "").strip())
            if value < 0:
                raise ValueError
            return value
        except ValueError:
            print("숫자만 입력해 주세요. 예: 110000")


def choose_opening_offer(max_price: int) -> int:
    """Simple deterministic buyer policy for the teaching demo."""
    rounded = (max_price * 90 // 100) // 1_000 * 1_000
    return max(1_000, rounded)


def new_commitment() -> str:
    return "0x" + secrets.token_hex(32)


def show_progress(message: str, cycles: int = 2) -> None:
    """Small terminal animation for a visibly ongoing negotiation/proof step."""
    for _ in range(cycles):
        for dots in (".", "..", "..."):
            sys.stdout.write(f"\r{message}{dots:<3}")
            sys.stdout.flush()
            time.sleep(0.18)
    sys.stdout.write("\r" + " " * (len(message) + 3) + "\r")
    sys.stdout.flush()


def send_line(sock: socket.socket, message: dict[str, Any]) -> None:
    sock.sendall((json.dumps(message) + "\n").encode())


def receive_lines(sock: socket.socket):
    buffer = ""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            return
        buffer += chunk.decode()
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            if line:
                yield json.loads(line)


class RelayState:
    def __init__(self) -> None:
        self.clients: dict[str, socketserver.StreamRequestHandler] = {}
        self.public_clients: set[socketserver.BaseRequestHandler] = set()
        self.public_events: list[dict[str, Any]] = []
        self.next_block = 12
        self.lock = __import__("threading").Lock()

    def publish_public(self, message: dict[str, Any]) -> dict[str, Any] | None:
        with self.lock:
            event = public_event_from_message(message, self.next_block)
            if event is None:
                return None
            self.next_block += 1
            self.public_events.append(event)
            clients = list(self.public_clients)
        payload = (json.dumps({"type": "PUBLIC_EVENT", "event": event}) + "\n").encode()
        for client in clients:
            try:
                client.request.sendall(payload)
            except OSError:
                self.unregister_observer(client)
        return event

    def register_observer(self, client: socketserver.BaseRequestHandler) -> None:
        with self.lock:
            self.public_clients.add(client)
            history = list(self.public_events)
        for event in history:
            client.request.sendall(
                (json.dumps({"type": "PUBLIC_EVENT", "event": event}) + "\n").encode()
            )

    def unregister_observer(self, client: socketserver.BaseRequestHandler) -> None:
        with self.lock:
            self.public_clients.discard(client)


relay_state = RelayState()


class RelayHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        file = self.request.makefile("r", encoding="utf-8")
        role = None
        try:
            for line in file:
                message = json.loads(line)
                if message["type"] == "HELLO":
                    role = message["role"]
                    if role == "observer":
                        relay_state.register_observer(self)
                        print("[Relay] observer connected", flush=True)
                        continue
                    with relay_state.lock:
                        relay_state.clients[role] = self
                        print(f"[Relay] {role} connected", flush=True)
                        if "buyer" in relay_state.clients and "seller" in relay_state.clients:
                            self.broadcast({"type": "READY"})
                    continue

                relay_state.publish_public(message)
                target = "seller" if message.get("from") == "buyer" else "buyer"
                with relay_state.lock:
                    recipient = relay_state.clients.get(target)
                    if recipient is not None:
                        recipient.request.sendall((json.dumps(message) + "\n").encode())
        finally:
            if role:
                if role == "observer":
                    relay_state.unregister_observer(self)
                else:
                    with relay_state.lock:
                        relay_state.clients.pop(role, None)
                print(f"[Relay] {role} disconnected", flush=True)

    @staticmethod
    def broadcast(message: dict[str, Any]) -> None:
        payload = (json.dumps(message) + "\n").encode()
        for client in relay_state.clients.values():
            client.request.sendall(payload)


class RelayServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def run_relay() -> None:
    with RelayServer((HOST, PORT), RelayHandler) as server:
        print(f"Relay Server가 {HOST}:{PORT}에서 대기 중입니다.", flush=True)
        print("구매자와 판매자 터미널을 각각 실행하세요.", flush=True)
        server.serve_forever()


@dataclass
class BuyerConfig:
    product: str
    max_price: int
    opening_offer: int


@dataclass
class SellerConfig:
    product: str
    min_price: int


def connect(role: str) -> socket.socket:
    try:
        sock = socket.create_connection((HOST, PORT))
    except ConnectionRefusedError:
        print("\nRelay Server에 연결할 수 없습니다.")
        print("먼저 다른 터미널에서 다음 명령을 실행하세요:")
        print("  python3 python_demo.py relay\n")
        raise SystemExit(1)
    send_line(sock, {"type": "HELLO", "role": role})
    return sock


def run_buyer(product: str) -> None:
    print("\n=== 구매자 터미널 ===\n")
    max_price = read_money("최대 예산(KRW): ")
    opening_offer = choose_opening_offer(max_price)
    buyer_commitment = new_commitment()
    config = BuyerConfig(product, max_price, opening_offer)

    with connect("buyer") as sock:
        print("\n구매자 조건을 저장했습니다. 판매자 연결을 기다리는 중...\n")
        for message in receive_lines(sock):
            if message["type"] == "READY":
                show_progress("구매자 commitment를 생성하는 중")
                print("온체인 시뮬레이션: createDeal(C_B) 완료\n")
                send_line(
                    sock,
                    {
                        "type": "CREATE_DEAL",
                        "from": "buyer",
                        "product": config.product,
                        "buyer_commitment": buyer_commitment,
                    },
                )
            elif message["type"] == "DEAL_JOINED":
                print("판매자가 딜에 합류했습니다.\n")
                print("협상을 시작합니다.\n")
                show_progress("협상이 진행되고 있습니다")
                send_line(sock, {"type": "OFFER", "from": "buyer", "product": config.product, "price": config.opening_offer})
            elif message["type"] == "COUNTER":
                price = int(message["price"])
                print(f"상대방의 반대 제안: {money(price)} KRW")
                if price <= config.max_price:
                    show_progress("협상이 진행되고 있습니다")
                    print(f"{money(price)} KRW 수락\n")
                    send_line(sock, {"type": "ACCEPT", "from": "buyer", "price": price})
                else:
                    print("예산을 초과해 협상이 결렬되었습니다.\n")
                    send_line(sock, {"type": "CANCEL", "from": "buyer"})
            elif message["type"] == "ACCEPT":
                price = int(message["price"])
                print(f"상대방이 {money(price)} KRW를 수락했습니다.\n")
                show_progress("구매자 조건을 증명하는 중")
                print("온체인 시뮬레이션: authorizeHiddenPrice PASS")
                print("가격 commitment C_P가 저장되었습니다.\n")
                print("오프체인 시뮬레이션: (p, r_P)를 판매자에게 전달했습니다.\n")
                send_line(
                    sock,
                    {
                        "type": "AUTHORIZED",
                        "from": "buyer",
                        "price": price,
                        "price_commitment": new_commitment(),
                        "price_opening": secrets.token_hex(8),
                    },
                )
            elif message["type"] == "SETTLED":
                print("거래가 체결되었습니다.")
                print(f"최종 합의 가격: {money(message['price'])} KRW")
                print("공개 상태: 구매자 예산 비공개 / 판매자 최소가 비공개")
                return
            elif message["type"] == "CANCEL":
                print("협상이 결렬되었습니다.")
                return


def run_seller(product: str) -> None:
    print("\n=== 판매자 터미널 ===\n")
    min_price = read_money("최소 판매가(KRW): ")
    seller_commitment = new_commitment()
    config = SellerConfig(product, min_price)

    with connect("seller") as sock:
        print("\n판매 조건을 저장했습니다. 구매자 연결을 기다리는 중...\n")
        for message in receive_lines(sock):
            if message["type"] == "CREATE_DEAL":
                if message["product"] != config.product:
                    print("상품 코드가 달라 딜에 합류하지 않습니다.")
                    send_line(sock, {"type": "CANCEL", "from": "seller"})
                    return
                show_progress("판매자 commitment를 생성하는 중")
                print("온체인 시뮬레이션: joinDeal(C_S) 완료\n")
                send_line(
                    sock,
                    {
                        "type": "DEAL_JOINED",
                        "from": "seller",
                        "product": config.product,
                        "seller_commitment": seller_commitment,
                    },
                )
            elif message["type"] == "OFFER":
                if message["product"] != config.product:
                    print("상품 코드가 달라 협상을 종료합니다.")
                    send_line(sock, {"type": "CANCEL", "from": "seller"})
                    return
                price = int(message["price"])
                show_progress("협상이 진행되고 있습니다")
                print(f"상대방의 제안: {money(price)} KRW")
                if price >= config.min_price:
                    print(f"{money(price)} KRW 수락\n")
                    send_line(sock, {"type": "ACCEPT", "from": "seller", "price": price})
                else:
                    print(f"반대 제안을 보냅니다: {money(config.min_price)} KRW")
                    send_line(sock, {"type": "COUNTER", "from": "seller", "price": config.min_price})
            elif message["type"] == "ACCEPT":
                price = int(message["price"])
                print(f"상대방이 {money(price)} KRW를 수락했습니다.")
                print("구매자의 조건 증명 제출을 기다리는 중...\n")
                send_line(sock, {"type": "ACCEPT", "from": "seller", "price": price})
            elif message["type"] == "AUTHORIZED":
                print("구매자 조건 증명을 확인했습니다.")
                print("오프체인 시뮬레이션: (p, r_P)를 수신했습니다.\n")
                show_progress("판매자 조건을 증명하는 중")
                print("온체인 시뮬레이션: settle + disclose(p) PASS\n")
                send_line(sock, {"type": "SETTLED", "from": "seller", "price": message["price"]})
                print("거래가 체결되었습니다.")
                print(f"최종 합의 가격: {money(message['price'])} KRW")
                print("공개 상태: 구매자 예산 비공개 / 판매자 최소가 비공개")
                return
            elif message["type"] == "CANCEL":
                print("협상이 결렬되었습니다.")
                return


def run_observer() -> None:
    print("=== Observer (누구나 볼 수 있는 온체인 상태) ===\n")
    print("공개 이벤트를 기다리는 중...\n")
    with connect("observer") as sock:
        for message in receive_lines(sock):
            if message.get("type") == "PUBLIC_EVENT":
                print(render_public_event(message["event"]), flush=True)


def run_client() -> None:
    product = input("상품 코드: ").strip()
    print("\n역할을 선택하세요.")
    print("1. 구매자")
    print("2. 판매자")
    while True:
        role = input("선택: ").strip()
        if role == "1":
            run_buyer(product)
            return
        if role == "2":
            run_seller(product)
            return
        print("1 또는 2를 입력해 주세요.")


def main() -> None:
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] not in {"relay", "observer"}):
        print("사용법: python3 python_demo.py [relay|observer]")
        raise SystemExit(2)
    if len(sys.argv) == 2:
        {"relay": run_relay, "observer": run_observer}[sys.argv[1]]()
    else:
        run_client()


if __name__ == "__main__":
    main()
