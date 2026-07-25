import unittest

from python_demo import RelayState, public_event_from_message, render_public_event, short_commitment


class PublicEventProjectionTests(unittest.TestCase):
    def test_short_commitment_uses_prefix_and_ellipsis(self):
        self.assertEqual(short_commitment("0x3fa2aabbccdd"), "0x3fa2…")

    def test_offer_is_not_public_event(self):
        self.assertIsNone(
            public_event_from_message(
                {"type": "OFFER", "from": "buyer", "price": 9000}, 12
            )
        )

    def test_create_deal_exposes_only_short_buyer_commitment(self):
        event = public_event_from_message(
            {
                "type": "CREATE_DEAL",
                "from": "buyer",
                "product": "111",
                "buyer_commitment": "0x3fa2aabb",
            },
            12,
        )
        self.assertEqual(
            event,
            {
                "event": "DEAL_CREATED",
                "block": 12,
                "deal_id": "111",
                "commitment": "0x3fa2…",
            },
        )

    def test_settled_exposes_price_but_not_private_fields(self):
        event = public_event_from_message(
            {
                "type": "SETTLED",
                "from": "seller",
                "price": 9000,
                "min_price": 7500,
            },
            15,
        )
        self.assertEqual(event, {"event": "SETTLED", "block": 15, "price": 9000})

    def test_seller_joined_exposes_only_short_seller_commitment(self):
        event = public_event_from_message(
            {
                "type": "DEAL_JOINED",
                "from": "seller",
                "seller_commitment": "0x8c1daabb",
            },
            13,
        )
        self.assertEqual(
            event,
            {"event": "SELLER_JOINED", "block": 13, "commitment": "0x8c1d…"},
        )

    def test_authorized_exposes_only_short_price_commitment(self):
        event = public_event_from_message(
            {
                "type": "AUTHORIZED",
                "from": "buyer",
                "price": 9000,
                "price_commitment": "0x77e9aabb",
                "price_opening": "secret-opening",
            },
            14,
        )
        self.assertEqual(
            event,
            {"event": "PRICE_COMMITTED", "block": 14, "commitment": "0x77e9…"},
        )

    def test_cancelled_contains_no_reason_or_price(self):
        event = public_event_from_message(
            {
                "type": "CANCEL",
                "from": "buyer",
                "reason": "over budget",
                "price": 9000,
            },
            15,
        )
        self.assertEqual(event, {"event": "CANCELLED", "block": 15})

    def test_settled_line_matches_public_view(self):
        self.assertEqual(
            render_public_event({"event": "SETTLED", "block": 15, "price": 9000}),
            "[block 15] SETTLED: 9,000 KRW",
        )

    def test_relay_history_contains_only_public_events_in_block_order(self):
        state = RelayState()
        state.publish_public(
            {
                "type": "CREATE_DEAL",
                "product": "111",
                "buyer_commitment": "0x3fa2aabb",
            }
        )
        state.publish_public({"type": "OFFER", "price": 9000})
        state.publish_public(
            {"type": "DEAL_JOINED", "seller_commitment": "0x8c1daabb"}
        )

        self.assertEqual(
            [event["event"] for event in state.public_events],
            ["DEAL_CREATED", "SELLER_JOINED"],
        )
        self.assertEqual([event["block"] for event in state.public_events], [12, 13])


if __name__ == "__main__":
    unittest.main()
