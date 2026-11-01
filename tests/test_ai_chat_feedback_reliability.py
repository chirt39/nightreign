import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main, memory_store


class AiChatFeedbackReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path_patch = patch.object(memory_store, "DB_PATH", Path(self.temp_dir.name) / "memory.sqlite3")
        self.db_path_patch.start()

    def tearDown(self):
        self.db_path_patch.stop()
        self.temp_dir.cleanup()

    def test_rate_limit_returns_ceil_seconds_and_is_per_client(self):
        with patch.object(memory_store.time, "time", return_value=1000.0):
            for _ in range(20):
                self.assertIsNone(memory_store.record_ai_request("client-a", 20))
            self.assertEqual(memory_store.record_ai_request("client-a", 20), 60)
            self.assertIsNone(memory_store.record_ai_request("client-b", 20))
        with patch.object(memory_store.time, "time", return_value=1000.5):
            self.assertEqual(memory_store.record_ai_request("client-a", 20), 60)
        with patch.object(memory_store.time, "time", return_value=1059.5):
            self.assertEqual(memory_store.record_ai_request("client-a", 20), 1)
        with patch.object(memory_store.time, "time", return_value=1060.0):
            self.assertIsNone(memory_store.record_ai_request("client-a", 20))

    def test_legacy_feedback_schema_migrates_and_lists_new_context(self):
        import sqlite3

        db = Path(memory_store.DB_PATH)
        db.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db)
        connection.execute("""CREATE TABLE feedback_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, message TEXT NOT NULL,
            email TEXT, question TEXT, answer TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
        )""")
        connection.execute("INSERT INTO feedback_submissions VALUES (1, 'answer', 'old', NULL, 'q', 'a', '2026-01-01', '2099-01-01')")
        connection.commit()
        connection.close()

        turns_json = json.dumps([{"question": "新问题", "answer": "新回答"}], ensure_ascii=False)
        self.assertIsNone(memory_store.save_feedback("answer", "new", None, "新问题", "新回答", 250, turns_json))
        items, total = memory_store.list_feedback()
        self.assertEqual(total, 2)
        self.assertIn("context_turns_json", items[0])
        self.assertEqual(json.loads(items[0]["context_turns_json"]), [{"question": "新问题", "answer": "新回答"}])
        self.assertEqual(items[1]["question"], "q")

    def test_feedback_daily_limit_returns_wait_until_utc_midnight(self):
        self.assertEqual(memory_store.seconds_until_next_utc_midnight(
            datetime(2026, 11, 1, 23, 59, 59, 200000, tzinfo=timezone.utc)
        ), 1)
        self.assertIsNone(memory_store.save_feedback("answer", "first", None, daily_limit=1))
        retry_after = memory_store.save_feedback("answer", "second", None, daily_limit=1)
        self.assertIsInstance(retry_after, int)
        self.assertGreater(retry_after, 0)

    def test_feedback_without_context_never_persists_attached_turns(self):
        client = TestClient(main.app, base_url="https://example.test")
        with patch.object(main, "FEEDBACK_ADMIN_PASSWORD", "x" * 40), \
             patch.object(main, "_feedback_rate_limit"), \
             patch.object(main.memory_store, "save_feedback", return_value=None) as save:
            response = client.post("/api/feedback", json={
                "kind": "answer", "message": "反馈内容", "include_context": False,
                "context_turns": [{"question": "q", "answer": "a"}],
            })
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(save.call_args.args[3])
        self.assertIsNone(save.call_args.args[4])
        self.assertIsNone(save.call_args.args[6])

    def test_feedback_accepts_multiround_and_rejects_oversize_without_truncation(self):
        client = TestClient(main.app, base_url="https://example.test")
        turns = [{"question": "第一问", "answer": "第一答"}, {"question": "第二问", "answer": "第二答"}]
        with patch.object(main, "FEEDBACK_ADMIN_PASSWORD", "x" * 40), \
             patch.object(main, "_feedback_rate_limit"), \
             patch.object(main.memory_store, "save_feedback", return_value=None) as save:
            accepted = client.post("/api/feedback", json={
                "kind": "answer", "message": "说明", "include_context": True,
                "context_turns": turns,
            })
            too_long = client.post("/api/feedback", json={
                "kind": "answer", "message": "说明", "include_context": True,
                "context_turns": [{"question": "问题", "answer": "答" * 20000}],
            })
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(json.loads(save.call_args_list[0].args[6]), turns)
        self.assertEqual(too_long.status_code, 422)
        self.assertIn("20000", too_long.json()["detail"])

    def test_chat_history_validation_is_readable_even_with_session_id(self):
        client = TestClient(main.app, base_url="https://example.test")
        response = client.post("/api/ai/chat", json={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "question": "黑剑弱点是什么？",
            "history": [
                {"role": "user", "content": "上一问"},
                {"role": "assistant", "content": "答" * 1201},
            ],
        })
        self.assertEqual(response.status_code, 422)
        self.assertIn("1200", response.json()["detail"])

    def test_verified_enemy_image_requires_one_exact_retrieved_id(self):
        retrieved = [{"id": "enemy:123", "category": "enemy"}]
        with patch.object(main, "_verified_enemy_ids", return_value=frozenset({"123"})):
            self.assertEqual(main._verified_enemy_id_for_retrieval(retrieved, "123"), "123")
            self.assertIsNone(main._verified_enemy_id_for_retrieval(retrieved, ["123"]))
            self.assertIsNone(main._verified_enemy_id_for_retrieval(
                retrieved + [{"id": "enemy:456", "category": "enemy"}], "123"
            ))
        with patch.object(main, "_verified_enemy_ids", side_effect=OSError("manifest unavailable")):
            self.assertIsNone(main._verified_enemy_id_for_retrieval(retrieved, "123"))

    def test_admin_feedback_normalizes_legacy_and_multiround_context(self):
        client = TestClient(main.app, base_url="https://example.test")
        rows = [
            {"id": 1, "question": "旧问题", "answer": "旧回答", "context_turns_json": None},
            {"id": 2, "question": None, "answer": None, "context_turns_json": json.dumps([
                {"question": "新问题1", "answer": "新回答1"},
                {"question": "新问题2", "answer": "新回答2"},
            ], ensure_ascii=False)},
        ]
        with patch.object(main, "FEEDBACK_ADMIN_PASSWORD", "x" * 40), \
             patch.object(main.memory_store, "list_feedback", return_value=(rows, 2)):
            response = client.get("/api/admin/feedback", headers={"Authorization": f"Bearer {'x' * 40}"})
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        self.assertEqual(items[0]["context_turns"], [{"question": "旧问题", "answer": "旧回答"}])
        self.assertEqual(len(items[1]["context_turns"]), 2)
        self.assertNotIn("context_turns_json", items[1])

    def test_retry_after_is_exposed_by_cors(self):
        client = TestClient(main.app, base_url="https://example.test")
        cors = next(item for item in main.app.user_middleware if item.cls.__name__ == "CORSMiddleware")
        with patch.object(main.memory_store, "record_ai_request", return_value=17):
            response = client.post("/api/ai/chat", json={
                "question": "黑剑弱点是什么？",
            })
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers.get("retry-after"), "17")
        self.assertIn("Retry-After", cors.kwargs["expose_headers"])


if __name__ == "__main__":
    unittest.main()
