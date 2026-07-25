---
# calm-design Design Interview 결과
# Generated: 2026-07-25T17:21:10+09:00
# Mode E Version: 1.0
---

interview:
  q1_target:
    question: "이 디자인을 사용할 주요 사용자는 누구인가요?"
    answer: "블록체인·ZK 경험이 섞인 발표 청중"
    confidence: 0.95
  q2_emotion:
    question: "사용자가 어떤 감정을 느꼈으면 하나요?"
    answer: "절제됨, 정직함, 신뢰감"
    confidence: 1.0
  q3_remember:
    question: "1주일 후에도 기억했으면 하는 한 가지는?"
    answer: "한도는 숨기고 조건 충족만 증명한다"
    confidence: 1.0
  q4_differ:
    question: "피하고 싶은 화면은 무엇인가요?"
    answer: "전체 트랜잭션 탐색기처럼 정보가 많거나 AI가 만든 듯 장식적인 화면"
    confidence: 0.95
  q5_goal:
    question: "가장 원하는 사용자 행동은 무엇인가요?"
    answer: "Buyer와 Seller가 각자의 비공개 가격 한도를 입력한 뒤 세 역할의 흐름을 한눈에 따라간다"
    confidence: 0.95

parsed:
  target_persona:
    role: "mixed_technical_audience"
    tech_level: "mixed"
    viewing_context: "desktop_presentation"
  desired_emotion:
    primary: "trust"
    secondary: "calm"
    avoid: ["hype", "playfulness", "visual_noise"]
  memorable_point:
    type: "privacy_boundary"
    value: "Private limits and negotiation contents stay private; only rule satisfaction is proven."
    emphasis: "private_vs_public"
  competitor_avoidance:
    patterns:
      - "explorer_density"
      - "dashboard_cards"
      - "ai_marketing_copy"
      - "decorative_gradients"
  business_goal:
    primary_action: "set_private_limits_then_observe"
    conversion_priority: "none"

design_mappings:
  copy:
    tone: "literal"
    style: "technical_plain"
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
  anti_patterns:
    project_specific:
      - "전체 체인 트랜잭션 목록 표시 금지"
      - "설명 카드·KPI·차트 추가 금지"
      - "마케팅 문구와 장식용 배지 금지"
      - "그래디언트·글로우·유리 효과 금지"
      - "이번 범위에서 WebSocket·터미널 연결 구현 금지"
      - "패널 배경을 상태색으로 칠하지 않고 텍스트에만 의미색 사용"
      - "AI 협상 내용·추론·제안 내역을 화면 로그에 노출 금지"
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
