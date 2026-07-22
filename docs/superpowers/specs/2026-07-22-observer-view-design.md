# Observer 온체인 뷰 설계

## 목적

구매자·판매자 터미널과 별개로, 제3의 `observer` 터미널을 추가한다. Observer는 “전 세계가 보는 것”을 표현하는 공개 ledger 뷰다. 협상 당사자의 비공개 조건이나 협상 대화는 표시하지 않고, 공개 상태 변화만 표시한다.

이 기능은 현재 Python relay 데모의 공개 projection이며, 실제 Midnight 연결 후에는 indexer가 제공하는 public ledger 상태로 교체할 수 있어야 한다.

## 실행 모드

```text
python3 python_demo.py relay       # 메시지 Relay
python3 python_demo.py observer    # 공개 ledger 뷰
python3 python_demo.py             # 구매자 또는 판매자 클라이언트
```

Relay, Observer, Buyer, Seller를 각각 별도 터미널에서 실행한다. Observer는 구매자·판매자보다 먼저 실행하는 것을 기본으로 한다. Relay는 공개 이벤트를 메모리에 보관하고, Observer가 늦게 연결되면 현재 딜의 이벤트를 순서대로 재전송한다.

## 공개 이벤트 계약

Observer가 받는 이벤트는 다음 다섯 종류뿐이다.

```text
DEAL_CREATED  → [block N] DEAL#<id> created — C_B: 0x3fa2…
SELLER_JOINED → [block N] C_S registered — 0x8c1d…
PRICE_COMMITTED → [block N] C_P registered — 0x77e9…
SETTLED       → [block N] SETTLED: 9,000 KRW
CANCELLED     → [block N] CANCELLED — 공개된 값: 없음
```

### 성공 경로

```text
[block N] DEAL#<id> created — C_B: 0x…
[block N] C_S registered — 0x…
[block N] C_P registered — 0x…
[block N] SETTLED: <가격>
```

### 결렬 경로

```text
[block N] DEAL#<id> created — C_B: 0x…
[block N] C_S registered — 0x…
[block N] CANCELLED — 공개된 값: 없음
```

결렬 경로에는 `C_P`, 합의 가격, 결렬 사유를 표시하지 않는다.

## 공개/비공개 경계

Observer가 절대로 받지 않는 값:

- 구매자 최대 예산
- 판매자 최소 가격
- 협상 제안·반대 제안·수락 메시지
- 협상 라운드 수
- `(p, r_P)` 원문
- commitment 전체 원문

Observer에는 commitment의 앞부분만 `0x3fa2…`처럼 표시한다. 말줄임표는 값을 숨긴 것이 아니라 화면에서 축약한 것임을 나타낸다.

Relay는 현재 MVP에서 협상 메시지를 전달하므로 당사자 간 제안 가격을 볼 수 있다. Observer가 보는 값과 Relay가 전송 과정에서 볼 수 있는 값을 혼동하지 않는다. 암호화된 Relay는 별도 확장 범위다.

## 블록 번호

현재 Python 데모에는 실제 블록체인이 없으므로 Relay가 공개 이벤트마다 증가하는 합성 block number를 붙인다. 이것은 온체인 기록의 모양을 설명하기 위한 시뮬레이션이며, 실제 Midnight 연결 후에는 indexer의 block height로 대체한다.

## 상태 전이

```text
CREATE_DEAL
  → SELLER_JOINED
  → PRICE_COMMITTED
  → SETTLED
```

합의 전에 결렬되면:

```text
CREATE_DEAL
  → SELLER_JOINED
  → CANCELLED
```

`PRICE_COMMITTED` 이후의 결렬도 가능하며, 그 경우에도 Observer에는 가격 원문이나 `(p, r_P)`를 표시하지 않고 `CANCELLED — 공개된 값: 없음`만 표시한다.

## 검증 기준

- 성공 시 Observer 출력은 C_B, C_S, C_P, SETTLED 네 줄이다.
- 결렬 시 Observer 출력에는 C_P와 가격이 없다.
- Observer 출력에는 `OFFER`, `COUNTER`, `ACCEPT`, 예산, 최소가, `(p, r_P)`가 없다.
- 각 commitment는 `0x`와 축약 prefix를 포함한다.
- 각 공개 이벤트는 합성 block number를 포함한다.
- 기존 구매자·판매자 터미널의 협상과 증명 순서는 유지된다.
- 실제 Midnight 연결 시 Observer 이벤트 공급원만 Relay에서 indexer로 교체할 수 있다.
