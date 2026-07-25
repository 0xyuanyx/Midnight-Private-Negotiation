---
# calm-design Design Interview 결과
# Generated: 2026-07-25T17:21:10+09:00
# Mode E Version: 1.0
---

interview:
  q1_target:
    question: "이 디자인을 사용할 주요 사용자는 누구인가요?"
    answer: "Buyer와 Seller 입력을 모두 조작해 데모 영상을 녹화하는 발표자와 블록체인·ZK 경험이 섞인 시청자"
    confidence: 0.95
  q2_emotion:
    question: "사용자가 어떤 감정을 느꼈으면 하나요?"
    answer: "내 한도가 상대방이나 공개 체인에 보이지 않는다는 강한 신뢰감"
    confidence: 1.0
  q3_remember:
    question: "1주일 후에도 기억했으면 하는 한 가지는?"
    answer: "한도는 끝까지 공개하지 않고 성공한 최종 금액만 온체인에 기록한다"
    confidence: 1.0
  q4_differ:
    question: "피하고 싶은 화면은 무엇인가요?"
    answer: "PID·지갑·prover·필드 audit를 모두 노출하는 복잡한 화면과 과도한 Web3 장식"
    confidence: 0.95
  q5_goal:
    question: "가장 원하는 사용자 행동은 무엇인가요?"
    answer: "Buyer와 Seller가 각자 같은 4자리 상품 코드와 자기 한도를 입력한 뒤 세 역할의 흐름을 한눈에 따라간다"
    confidence: 0.95

parsed:
  target_persona:
    role: "demo_operator_and_mixed_technical_audience"
    tech_level: "mixed"
    viewing_context: "desktop_screen_recording"
  desired_emotion:
    primary: "privacy_assurance"
    secondary: "trust"
    avoid: ["hype", "playfulness", "visual_noise"]
  memorable_point:
    type: "privacy_boundary"
    value: "Private limits stay out of the counterparty, GPT prompt, Relay plaintext, and public chain; only a successful final price is disclosed."
    emphasis: "role_local_private_vs_public_final"
  competitor_avoidance:
    patterns:
      - "explorer_density"
      - "dashboard_cards"
      - "ai_marketing_copy"
      - "decorative_gradients"
  business_goal:
    primary_action: "join_same_room_set_role_local_limits_then_observe"
    conversion_priority: "none"

design_mappings:
  copy:
    tone: "literal_korean"
    style: "technical_plain_with_protocol_identifiers"
    jargon_level: "minimal_with_exact_protocol_terms"
  color:
    canvas: "#101010"
    accent: "#0000FE"
    source: "https://midnight.network/"
  motion:
    intensity: 2
    style: "negotiating_spinner_only"
  typography:
    ui: "Pretendard"
    terminal: "system_monospace"
  layout:
    direction: "equal_three_panel"
    panel_order: ["buyer", "seller", "observer"]
    product_code_input: "separate_in_buyer_and_seller"
    product_code_format: "four_digits"
    locked_limit_display: "show_own_value_with_lock"
  anti_patterns:
    project_specific:
      - "전체 체인 트랜잭션 목록 표시 금지"
      - "설명 카드·KPI·차트 추가 금지"
      - "마케팅 문구와 장식용 배지 금지"
      - "그래디언트·글로우·유리 효과 금지"
      - "패널 배경을 상태색으로 칠하지 않고 텍스트에만 의미색 사용"
      - "AI 협상 내용·추론·제안 내역을 화면 로그에 노출 금지"
      - "성공 전 합의 금액 또는 실패한 협상 금액 공개 금지"
      - "실제 역할명·프로토콜 식별자 외 영어 UI 문구 금지"
      - "공용 상품 코드 입력 금지 — Buyer와 Seller가 각자 입력"
      - "PolicyGuard 판정·폐기 후보·GPT 재요청 로그 노출 금지"
  suggested_dials:
    variance: 3
    motion: 2
    density: 6
    language: "ko"

metadata:
  created_at: "2026-07-25T17:21:10+09:00"
  questions_answered: 5
  questions_skipped: 0
  mode_transition_to: "A"

next_steps:
  recommended_mode: "A"
  ready_for_generation: true
