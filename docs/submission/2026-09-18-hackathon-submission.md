# Midnight Korea Hackathon 2026 제출 양식 초안

마감: 2026-09-28 00:00 KST. 아래 문장은 README의 주장 범위를 넘지 않도록 작성했다. 제출 전에 README와 함께 다시 대조한다.

## 프로젝트명

Midnight Private Negotiation

## 한 줄 설명

하도급 부품 납품 단가를 원사업자의 최대 한도와 수급사업자의 원가 기반 최저가를 공개하지 않고 협상하고, 합의가 성립해도 합의 가격은 공개하지 않은 채 두 한도 조건을 만족했다는 사실만 Midnight에 확정하는 비공개 협상 DApp

## 저장소

https://github.com/0xyuanyx/Midnight-Private-Negotiation

## 해결하려는 문제

하도급법은 원사업자가 수급사업자에게 재료비·노무비 같은 원가 정보를 정당한 사유 없이 요구하는 것을 금지한다(공정위 고시 제2018-12호). 그래도 수급사업자는 원가를 근거로 한 최저 수용가를 가지고 협상하고, 원사업자는 내부에서 승인된 최대 한도를 가지고 협상한다. 중소벤처기업부 2024년 납품대금 연동제 실태조사에서도 미연동 약정을 맺은 35개사가 꼽은 1순위 사유가 "위탁기업에 원가 정보를 제공하기 싫어서"(45.7%)였다. 정부는 원가를 제3의 전문기관에 제출하는 방식으로 이 부담을 줄이고 있다.

이 DApp은 두 예약 가격을 상대방·AI·Relay·공개 원장에 전달하지 않고 합의 가능성을 확인한다. 합의가 성립해도 공개 원장에는 가격 commitment만 남고 합의 가격은 거래 당사자만 안다. 근거와 한계는 `docs/research/2026-09-17-subcontract-cost-disclosure.md`에 있다.

## 실행 방법

README의 "최초 설치"와 "실제 Midnight 로컬 체인 모드"를 따른다. 요약:

```bash
git clone https://github.com/0xyuanyx/Midnight-Private-Negotiation.git
cd Midnight-Private-Negotiation
compact update 0.31.1 --no-set-default
npm run bootstrap
npm test
npm --prefix apps/demo-web ci
npm run demo:local
```

`demo:local`은 Docker로 로컬 Midnight 체인을 띄우고 Controller와 웹을 함께 실행한다. 기본 포트가 사용 중이면 빈 포트를 자동으로 고르고, 준비되면 열 주소를 출력한다. 출력된 주소(기본 `http://localhost:3001`)에서 Buyer와 Seller가 각각 상품 코드 `4821`을 입력한다. 성공은 Buyer `110000000` / Seller `95000000`, 결렬은 초기화 뒤 Buyer `90000000` / Seller `95000000`. `mock`은 API 키 없이 결정론적 후보 생성기를 쓴다. 실제 OpenAI 협상은 `npm run demo:midnight`와 API 키가 필요하다.

## Midnight 구현 포인트

- **비공개 한도는 witness로만 존재한다.** Buyer 최대 한도와 Seller 최저 수용가는 계약의 witness로만 전달되고, 공개 ledger에는 `persistentHash`로 만든 commitment만 남는다. commitment는 `dealId`, 역할 태그, 공개키, 금액, 32바이트 난수를 묶어 도메인을 분리한다.
- **협상 전에 한도를 고정하고, 정산 때 다시 검증한다.** Buyer 한도 commitment는 배포 시 생성자에서, Seller 한도 commitment는 `joinDeal`에서 기록된다. Controller는 체인에서 `OPEN`이 확인되기 전에는 협상을 시작하지 않는다. `authorizeHiddenPrice`는 합의 가격이 Buyer 한도 이하임을, `settle`은 Seller 한도 이상임을 각 commitment를 다시 계산해 증명한다. 협상 뒤에 다른 한도를 주장할 수 없다.
- **합의 가격도 공개하지 않고 정산한다.** 계약에는 가격 필드가 없다. `authorizeHiddenPrice`가 가격 commitment만 기록하고, `settle`은 같은 commitment를 다시 열어 Seller 최저가 이상임을 증명한 뒤 상태만 `SETTLED`로 바꾼다. `SETTLED`가 확인되면 Buyer와 Seller 런타임이 각자 보관한 가격과 난수로 온체인 commitment를 다시 계산해 일치를 확인한다. 로컬 체인에서 Indexer의 트랜잭션 원문과 계약 상태를 검사해 합의 가격과 양측 한도의 인코딩 값이 없음을 확인했다.
- **제안 가격이 한도를 드러내지 않는다.** 협상 제안은 공개 기준가와 라운드로만 계산한 공개 사다리에서 나온다. 비공개 한도는 수락·역제안·중단 판단에만 쓰이며, 한도에 맞춰 가격을 깎아 보내지 않는다. 이전 버전은 한도의 비율로 제안을 만들어 한도를 약 300원 폭으로 역산할 수 있었고, 이를 회귀 테스트로 막았다.
- **역할 권한은 비밀키에서 유도한 공개키로 검사한다.** 배포할 때 Buyer와 Seller의 공개키를 계약에 고정(`export sealed ledger`)하고, 각 회로가 `publicKey(secretKey()) == 고정된 키`를 검사한다. 제3자는 참여·승인·정산·취소를 할 수 없고, 계약 테스트로 확인한다.
- **역할별 증명과 공개 상태 관찰을 분리했다.** Buyer와 Seller는 각자의 프로세스와 전용 proof server에서 트랜잭션을 만든다. Observer는 Indexer의 공개 상태만 읽어 `OPEN → AUTHORIZED → SETTLED` 또는 `CANCELLED`를 표시한다.
- **AI는 한도를 모르고 안전 조건을 바꾸지 못한다.** AI 요청에는 상품 코드, 공개 기준가격, 현재 제안, 라운드, 역할만 들어간다. 각 역할의 로컬 PolicyGuard와 StrategyGuard가 한도와 공개 사다리를 벗어난 후보를 거부하고, 계약이 결과를 검증한다. AI는 허용 범위 안에서 협상 순서·합의 시점을 바꿀 수 있을 뿐이다. 이 DApp의 핵심은 AI 협상 성능이 아니라 비공개 조건을 지키는 자동 협상과 그 결과의 검증이다.
- **거래 뒤에도 합의를 확인할 수 있다.** 정산 후 각 당사자가 합의 가격·가격 난수·계약 정보를 macOS 키체인 키로 암호화해 보관하고, 다시 읽어 체인과 대조한 뒤에만 한도·비밀키·세션 키를 정리한다. 앱을 종료한 뒤 `npm run evidence -- verify`로 보관한 증빙을 복호화해 온체인 `SETTLED` 상태와 가격 commitment를 다시 확인한다.

## 검증 기록

- 루트 테스트 62/62, 웹 테스트 8/8, 계약 테스트 8/8 (2026-09-23). 계약 테스트에는 제3자의 참여·승인·정산·취소 거절과 공개 ledger·transcript의 가격 부재 검사가 포함된다.
- 공개 원격을 새로 클론해 설치·컴파일·전체 테스트가 통과하는 것을 확인했다 (2026-09-18).
- 로컬 Midnight Node·Indexer·proof server에서 성공 `OPEN → AUTHORIZED → SETTLED · 금액 비공개`(양측 commitment 확인 포함)와 결렬 `OPEN → CANCELLED · 공개된 금액 없음` 확인 (2026-09-23)
- 합의 성공 → 앱 종료 → `npm run evidence -- verify`로 양측 증빙 복호화·온체인 대조 성공. 변조 파일·다른 키 거절, `AUTHORIZED`에서 강제 종료한 거래는 확정으로 처리하지 않음 (2026-09-23)
- Claude Code midnight-expert로 계약 보안 감사를 수행했다. 발견한 Seller 자리 탈취 문제를 실행으로 확인하고 수정한 뒤 재검증했다. 상세 기록은 `docs/2026-09-09-review-reproducibility.md`에 있다.

## 신뢰 경계와 하지 않는 주장

- 한 화면의 Buyer·Seller·Observer 콘솔은 발표용 데모다. 브라우저와 로컬 Demo Controller는 한도를 평문으로 취급하며, 독립된 구매자·판매자 클라이언트가 아니다.
- 합의 가격은 공개 원장에 없지만, 발표용 한 화면에서는 Buyer·Seller 패널이 거래 당사자로서 합의 가격을 표시하고 이 값은 로컬 Controller를 거친다.
- 계약 주소, 호출한 회로 이름, 상태 변화 시점은 공개된다. 거래 존재나 참여 관계를 숨기지 않는다.
- 수락·중단 시점은 한도가 공개 사다리의 어느 2%p 구간에 있는지 알려줄 수 있다. 완전한 한도 비밀성을 주장하지 않는다. 공개 기준가에서 크게 벗어난 한도는 겹치더라도 결렬될 수 있다.
- 중간 기록 정리는 LevelDB 논리 삭제와 메모리 참조 해제다. 디스크 잔여 데이터·백업·상대방이나 외부 AI의 사본까지 지운다고 주장하지 않는다. 키체인이 없는 환경의 파일 키 방식은 키와 증빙을 함께 가져가면 복호화할 수 있다.
- 하도급법이나 연동제 준수를 판정하거나 원가의 진위를 확인하지 않는다. 실제 고객 검증은 하지 않았다.
- 공개 테스트넷·메인넷 배포와 호스팅된 라이브 URL은 없다. 로컬 Docker 체인에서 실행한다.

## 데모 영상

(업로드 후 링크 추가)

2026-09-18에 로컬 Midnight 체인에서 실행한 화면으로 113초 영상을 만들었다. 이 영상은 최종가 비공개 전환 이전 버전이며 성공 장면에 합의 가격이 공개된다. 제출 전에 새 버전으로 다시 녹화해야 한다. 1600×900, WebM(VP8). 구성은 제목 → 문제 → 시연 1(성공, `SETTLED · 100,000,000 KRW`) → 시연 2(결렬, `CANCELLED · 공개된 금액 없음`) → 계약 테스트 8/8 → 마무리다.

- 화면은 실제 데모를 headless Chromium으로 조작하며 캡처한 것이다. 브라우저 화면을 합성하거나 로그를 만들어 넣지 않았다.
- 화면 변화가 없는 체인 대기 구간만 빨리 감았고, 오른쪽 아래에 실제 배속("대기 구간 N배속")을 표시했다. 입력과 상태 변화 구간은 실제 속도다.
- 협상 후보는 mock 생성기로 만들었고, 영상 자막에도 그렇게 표시했다.
- 계약 테스트 화면은 실제 `node --test` 출력 텍스트를 그대로 옮긴 것이다.
