# Midnight Private Negotiation Demo Web

Buyer, Seller, Observer를 한 화면에 표시하는 발표용 프론트엔드 목업입니다.

현재 버전은 Demo Controller의 WebSocket에서 정제된 `DemoEvent`를 받아 표시합니다.

```bash
npm install
npm run dev
npm test
```

## 목업 흐름

1. 각 패널의 로그 마지막 줄에서 동일한 네 자리 상품 코드를 입력합니다.
2. 코드 입력 줄은 사라지고 상단 상태 줄에 코드가 반영됩니다.
3. Buyer 최대 한도와 Seller 최소 금액도 같은 터미널 프롬프트에서 입력합니다.
4. 금액 입력 줄은 사라지고 자기 패널 상단에 잠긴 값으로 표시됩니다.
5. 한도가 겹치면 양쪽에 같은 시간의 공동 로그를 전달하고 증명과 `SETTLED` 흐름을 재생합니다.
6. 한도가 겹치지 않으면 내부적으로 최대 10라운드 후 금액 없이 `CANCELLED`로 끝납니다.

화면 로그에는 출처 태그를 표시하지 않습니다. Observer는 `OPEN`, `AUTHORIZED`,
`SETTLED` 또는 `CANCELLED`처럼 공개 계약 상태만 확인합니다.

협상 원문, 후보 가격, PolicyGuard 판정, 내부 라운드는 어떤 패널에도 표시하지 않습니다.
