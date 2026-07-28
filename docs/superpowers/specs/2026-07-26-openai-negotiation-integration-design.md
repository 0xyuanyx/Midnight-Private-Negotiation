# OpenAI Negotiation Integration Design

## 목표

Buyer와 Seller의 격리 런타임이 OpenAI Responses API를 직접 호출해 협상 후보를 만들되, 각 사용자의 가격 한도와 로컬 정책 판정은 외부 모델·Controller·Relay·Observer에 전달하지 않는다. API가 실패하거나 후보가 로컬 정책을 통과하지 못해도 기존 결정론적 로컬 fallback이 거래 흐름을 안전하게 이어받는다.

## 승인된 신뢰 경계

- OpenAI 입력은 `role`, `productCode`, `round`, `publicReferencePrice`, `currentOffer`만 허용한다.
- Buyer 최대 한도, Seller 최소 금액, commitment 난수, 비밀키, 지갑 정보, PolicyGuard 판정, 폐기 후보, 폐기 횟수와 재요청 횟수는 모델 입력에서 제외한다.
- Buyer와 Seller는 서로 다른 프로세스에서 서로 다른 역할 프롬프트로 요청한다.
- 모든 요청은 `store: false`이며 `previous_response_id`나 Conversations API를 사용하지 않는 stateless 요청이다.
- Structured Outputs로 최대 다섯 개의 `{ action, price }` 후보만 받는다.
- 후보의 전송·수락 가능 여부는 각 역할 프로세스의 `PolicyGuard`가 로컬 한도로 결정한다.
- 거절된 후보와 거절 이유는 외부 전송·사용자 로그·다음 모델 요청에 포함하지 않는다.
- OpenAI 호출이 실패하면 해당 실패는 사용자 화면에 상세 노출하지 않고 로컬 fallback으로 전환한다.
- `store: false`는 요청 단위 application state 저장을 끄는 설정이며 조직 단위 Zero Data Retention과 동일한 보장은 아니다.

## 선택한 구조

### 채택: 역할 런타임 직접 호출

`buyer-runtime`과 `seller-runtime`이 동일한 `CandidateProvider` 인터페이스를 통해 OpenAI provider를 사용한다. 모델 응답은 런타임 내부에서 즉시 검증되고 PolicyGuard를 통과한 후보만 암호화 Relay로 전송된다.

이 구조를 선택한 이유:

- 한도와 PolicyGuard가 이미 존재하는 역할별 로컬 신뢰 경계를 유지한다.
- Controller가 협상 후보나 정책 판정을 보지 않는다.
- mock과 실제 API를 동일 인터페이스로 교체할 수 있다.
- API 장애 시 기존 fallback으로 데모가 중단되지 않는다.

### 제외: Controller 중앙 호출

Controller가 두 역할의 모델 요청을 대신하면 한도 자체를 받지 않더라도 협상 후보와 양쪽 흐름이 한 프로세스에 모인다. 역할 격리와 발표 메시지가 약해지므로 사용하지 않는다.

### 제외: 상태형 모델 대화

`previous_response_id`나 서버 저장 대화를 사용하면 폐기된 후보나 정책 판정의 간접 신호가 다음 요청에 축적될 수 있다. 본 데모는 공개 입력만 매번 새로 보내는 stateless 구조를 유지한다.

## 공개 기준가

첫 Buyer 요청에는 상대 제안이 없으므로 가격 후보를 만들 공개 기준점이 필요하다. `publicReferencePrice`는 상품의 공개 기준가이며 비공개 한도가 아니다. 기본 데모 값은 `100000` KRW이고 `NEGOTIATION_REFERENCE_PRICE_KRW`로 변경할 수 있다. 이 값은 양쪽 런타임과 모델이 알아도 되는 공개 협상 맥락이다.

## Provider 계약

`createOpenAIResponsesProvider(options)`는 다음 요청을 `POST /v1/responses`로 보낸다.

```json
{
  "model": "gpt-5.6-sol",
  "instructions": "<역할별 협상 지침>",
  "input": "{\"role\":\"buyer\",\"productCode\":\"1111\",\"round\":1,\"publicReferencePrice\":\"100000\"}",
  "store": false,
  "reasoning": { "effort": "low" },
  "max_output_tokens": 700,
  "text": {
    "format": {
      "type": "json_schema",
      "name": "negotiation_candidates",
      "strict": true,
      "schema": "<후보 배열 JSON Schema>"
    }
  }
}
```

응답에서는 `output[].content[].output_text`만 모아 JSON으로 파싱한다. HTTP 오류, 불완전 응답, JSON 파싱 실패, 스키마 위반은 모두 provider 실패로 처리한다. `generateAllowedCandidate`는 같은 공개 입력으로 최대 세 번 stateless 요청한 뒤 로컬 fallback으로 전환한다.

## 환경 변수와 실행

- `NEGOTIATION_AI_PROVIDER=openai`: 실제 OpenAI provider 활성화
- `MEMO_OPENAI_API_KEY`: 현재 사용자 셸에 저장된 키
- `OPENAI_API_KEY`: 표준 대체 키
- `OPENAI_NEGOTIATION_MODEL`: 기본값 `gpt-5.6-sol`
- `NEGOTIATION_REFERENCE_PRICE_KRW`: 기본값 `100000`

Controller는 provider가 `openai`일 때만 키를 Buyer와 Seller 자식 프로세스에 전달한다. Observer와 Relay에는 키를 전달하지 않는다. 키 값은 로그·IPC·웹 이벤트·문서에 출력하거나 저장하지 않는다.

## 오류 처리

1. 시작 시 provider 값과 키 존재 여부를 검증한다.
2. API 요청은 제한 시간 후 중단한다.
3. API 오류와 잘못된 후보는 `generateAllowedCandidate` 내부에서 폐기한다.
4. 세 번의 독립 요청이 모두 실패하면 로컬 fallback을 사용한다.
5. fallback도 정책상 후보를 만들 수 없으면 정상 결렬 처리한다.
6. UI에는 기존의 `AI 에이전트가 비공개 협상을 진행하고 있습니다.`만 표시한다.

## 검증 기준

- 요청 JSON에 허용된 공개 필드 외의 이름이나 한도 값이 없다.
- `store`는 항상 `false`이고 이전 response ID가 없다.
- Structured Outputs 스키마와 application-side 후보 검증을 모두 통과해야 한다.
- OpenAI 키가 Observer와 Relay 환경에 전달되지 않는다.
- 실제 API happy path가 합의되고 non-overlap path가 결렬된다.
- API가 실패해도 로컬 fallback으로 기존 데모가 완료된다.
- 기존 전체 테스트와 웹 테스트가 모두 통과한다.

## 2026-07-26 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript 및 전체 런타임 테스트 | 35개 모두 통과 |
| OpenAI 요청 형식 | `store: false`, strict Structured Outputs, 공개 입력 필드만 포함 확인 |
| 자격 증명 격리 | Buyer·Seller에만 전달, Observer에는 비전달 확인 |
| 실제 API endpoint 도달 | 완료 |
| 실제 모델 후보 품질 평가 | `429 insufficient_quota`로 보류 |
| 장애 fallback 전체 흐름 | OpenAI 모드에서 로컬 fallback으로 `SETTLED · 99,000 KRW` 완료 |

실제 API 호출이 429를 반환한 것은 provider 선택·네트워크·인증 헤더 배선 이후의 프로젝트 할당량 문제다. 따라서 이 결과를 “실제 GPT 협상이 성공했다”고 표현하지 않는다. 할당량을 복구한 뒤 `npm run test:openai`를 다시 실행해야 실제 모델이 고른 후보로 happy path와 결렬 시나리오를 모두 통과한 것으로 판정한다.

## 발표 시 정확한 표현

- 정확한 개인 한도 필드는 OpenAI 요청에 포함하지 않는다.
- 공개된 현재 제안과 공개 기준가는 모델이 본다.
- `store: false`는 Zero Data Retention과 같은 표현으로 과장하지 않는다.
- 최종 정책 집행자는 모델이 아니라 역할별 로컬 `PolicyGuard`와 Midnight 회로다.
- 현재 온체인 검증은 로컬 Midnight 네트워크 기준이며 공개 테스트넷·메인넷 배포는 별도 단계다.
