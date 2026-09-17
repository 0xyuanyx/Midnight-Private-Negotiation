# GPU 서버 10대 비공개 견적 협상 데모

시연 값: 상품 코드 `4821`, 공개 기준가격 `100,000,000 KRW`, 설명용 납기 30일. 모두 가상 값이다. 품목·수량·납기는 발표 맥락이며 현재 AI 요청이나 계약 입력에 들어가지 않는다. 아래 화면은 Buyer·Seller·Observer가 함께 보이는 로컬 발표용 콘솔이다.

## 1. 문제 소개

“기업 구매 담당자와 공급업체가 동일 규격 GPU 서버 10대의 견적을 협상합니다. 구매자의 최대 승인 한도와 공급업체의 최저 수용가가 서로 알려지면 내부 가격 정책이 드러납니다. 이 데모는 두 예약 가격을 상대방·AI·Relay·공개 원장에 전달하지 않고 합의 가능성을 확인합니다.”

실행 전에 별도 터미널에서 아래 순서로 준비한다.

```bash
npm run midnight:up
NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
npm --prefix apps/demo-web run dev -- --port 3001
```

`mock`은 실제 AI 대신 공개 입력으로 결정론적 가격 후보를 만든다. AI 모델 자체를 시연할 때는 API 키를 설정하고 `demo:midnight`를 사용해야 한다.

## 2. 성사

`http://localhost:3001/`에서 Buyer와 Seller에 각각 상품 코드 `4821`을 입력한다. Buyer 최대 한도 `110000000`, Seller 최소 금액 `95000000`을 입력한다. 두 값은 시연용이며 같은 화면에서는 각 역할의 입력과 자기 한도 표시가 보인다.

Observer에서 `OPEN → AUTHORIZED → SETTLED`를 확인하고, **최종 합의 가격은 `SETTLED` 이후에만** 보여준다. 중간 후보 가격과 실패한 제안은 화면에 출력하지 않는다. 화면의 최종 가격은 실행 결과를 읽고 그대로 말한다. 사전에 특정 합의 금액을 약속하지 않는다.

## 3. 가격 미중첩 결렬

화면의 초기화 버튼을 누른 뒤 동일한 상품 코드 `4821`로 다시 시작한다. Buyer 최대 한도 `90000000`, Seller 최소 금액 `95000000`을 입력한다. 결과가 `CANCELLED`이고 Observer에 결렬 가격이 표시되지 않는지 확인한다. 이 경로는 가격 증명과 정산 단계로 진행하지 않는다.

## 4. 무단 정산 거절

터미널에서 계약 테스트를 실행한다.

```bash
node --test packages/negotiation-contract/test/contract.test.mjs
```

`rejects third-party settlement and leaves the authorized ledger unchanged` 테스트가 통과한 줄을 보여준다. Seller의 비밀키와 다른 제3자 비밀키로 `settle`을 시도하면 계약이 거절하며, 공개 상태는 `AUTHORIZED`, 최종 가격은 `0`으로 남는다. 이것은 UI 버튼이 아닌 계약 회귀 테스트다.

## 5. 마무리

“AI 또는 mock 제안자는 공개된 상품 코드·기준가격·현재 제안·라운드로 가격 후보를 만듭니다. 역할별 로컬 guard가 자기 예약 가격과 양보 전략을 검사합니다. 거래가 성립하면 Midnight 계약이 비공개 한도와 합의 가격의 관계를 검증하고, 최종 가격만 공개합니다.”

신뢰 경계: 브라우저와 로컬 Demo Controller는 한도를 평문으로 취급한다. 독립된 구매자·판매자 클라이언트나 플랫폼 전체의 한도 비인지성을 주장하지 않는다. 발표가 끝나면 로컬 인프라를 종료한다.

```bash
npm run midnight:down
```
