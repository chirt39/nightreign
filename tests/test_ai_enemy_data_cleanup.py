import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from starlette.requests import Request

from backend import build_knowledge_base, main, rag_store


class EnemyCorpusCleanupTests(unittest.TestCase):
    def test_generated_corpus_excludes_removed_fields_and_entities(self):
        records = build_knowledge_base.build()
        enemy_rows = [row for row in records if row["category"] == "enemy"]
        image_rows = [row for row in records if row["category"] == "enemy_image"]
        self.assertEqual(len(enemy_rows), 1662)
        self.assertEqual(len(image_rows), 371)
        for row in enemy_rows:
            self.assertFalse(any(label in row["content"] for label in build_knowledge_base.REMOVED_ENEMY_FIELD_LABELS))
        for field in ("第一日生命值", "增益率", "等效韧性值"):
            self.assertTrue(any(field in row["content"] for row in enemy_rows))
        record_ids = {row["id"] for row in enemy_rows + image_rows}
        for enemy_id in build_knowledge_base.REMOVED_ENEMY_IDS:
            self.assertNotIn(f"enemy:{enemy_id}", record_ids)
            self.assertNotIn(f"enemy-image:{enemy_id}", record_ids)
        self.assertTrue(any(row["category"] == "enemy_scale" for row in records))

    def test_recalled_context_filters_only_removed_field_answers(self):
        composite_answer = "出血、冻伤、催眠、发狂的承受值均为0.5，因此这些异常状态也不容易生效。"
        self.assertTrue(main._contains_removed_enemy_field(composite_answer))
        self.assertFalse(main._contains_removed_enemy_field("承受火焰伤害时要躲避。"))
        recalled = [
            "\u7528\u6237\u66fe\u95ee\uff1a\u51fa\u8840\u627f\u53d7\u7387\u662f\u591a\u5c11\uff1f\uff1b\u52a9\u624b\u66fe\u7b54\uff1a\u51fa\u8840\u627f\u53d7\u7387\u662f 75%\u3002",
            f"用户曾问：黑剑弱点是什么？；助手曾答：{composite_answer}",
            "\u7528\u6237\u66fe\u95ee\uff1a\u5982\u4f55\u63d0\u9ad8\u751f\u5b58\uff1f\uff1b\u52a9\u624b\u66fe\u7b54\uff1a\u4f18\u5148\u9009\u62e9\u751f\u547d\u503c\u548c\u9632\u5fa1\u8bcd\u6761\u3002",
        ]
        self.assertEqual(
            main._filter_recalled_context(recalled),
            [
                "\u7528\u6237\u66fe\u95ee\uff1a\u51fa\u8840\u627f\u53d7\u7387\u662f\u591a\u5c11\uff1f",
                "用户曾问：黑剑弱点是什么？",
                "\u7528\u6237\u66fe\u95ee\uff1a\u5982\u4f55\u63d0\u9ad8\u751f\u5b58\uff1f\uff1b\u52a9\u624b\u66fe\u7b54\uff1a\u4f18\u5148\u9009\u62e9\u751f\u547d\u503c\u548c\u9632\u5fa1\u8bcd\u6761\u3002",
            ],
        )


class _FakeCollection:
    def __init__(self, name, metadata=None, rows=None):
        self.name = name
        self.metadata = metadata or {}
        self.rows = rows or {}

    def get(self, ids=None, include=None):
        selected = list(self.rows) if ids is None else [item for item in ids if item in self.rows]
        result = {"ids": selected}
        if include and "documents" in include:
            result["documents"] = [self.rows[item][0] for item in selected]
        if include and "metadatas" in include:
            result["metadatas"] = [self.rows[item][1] for item in selected]
        if include and "embeddings" in include:
            result["embeddings"] = [self.rows[item][2] for item in selected]
        return result

    def upsert(self, ids, embeddings, documents, metadatas):
        for values in zip(ids, documents, metadatas, embeddings):
            record_id, document, metadata, vector = values
            self.rows[record_id] = (document, metadata, vector)

    def delete(self, ids):
        for record_id in ids:
            self.rows.pop(record_id, None)

    def count(self):
        return len(self.rows)


class _FakeChroma:
    def __init__(self, active):
        self.active = active
        self.collections = {active.name: active}

    def get_collection(self, name):
        return self.collections[name]

    def list_collections(self):
        return list(self.collections)

    def create_collection(self, name, metadata):
        collection = _FakeCollection(name, metadata)
        self.collections[name] = collection
        return collection


class IndexMigrationTests(unittest.TestCase):
    def test_reuses_only_identical_embedding_inputs_and_drops_old_ids(self):
        metadata = {"embedding_model": "text-embedding-v4", "embedding_dimensions": 2}
        old = _FakeCollection(
            "nightreign_kb_old",
            metadata,
            {
                "item:keep": ("原文", {"title": "相同标题"}, [1.0, 2.0]),
                "enemy:change": ("旧内容", {"title": "敌人"}, [3.0, 4.0]),
                "enemy:deleted": ("删除", {"title": "旧记录"}, [5.0, 6.0]),
            },
        )
        db = _FakeChroma(old)
        records = [
            {"id": "item:keep", "category": "item", "title": "相同标题", "content": "原文", "source": "x", "keywords": "k"},
            {"id": "enemy:change", "category": "enemy", "title": "敌人", "content": "新内容", "source": "y", "keywords": "k"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            active_file = Path(directory) / "active.json"
            active_file.write_text(json.dumps({"collection": old.name}), encoding="utf-8")
            with (
                patch.object(rag_store, "ACTIVE_COLLECTION_FILE", active_file),
                patch.object(rag_store, "_chroma", return_value=db),
                patch.object(rag_store, "CORPUS") as corpus_path,
                patch.object(rag_store, "corpus_records", return_value=records),
                patch.object(rag_store, "EMBEDDING_API_KEY", "mock-key"),
                patch.object(rag_store, "EMBEDDING_MODEL", "text-embedding-v4"),
                patch.object(rag_store, "EMBEDDING_DIMENSIONS", 2),
                patch.object(rag_store, "embed_texts", return_value=[[9.0, 9.0]]) as embed,
            ):
                corpus_path.read_bytes.return_value = b"mock corpus"
                result = rag_store.rebuild(batch_size=10)
                activated = json.loads(active_file.read_text(encoding="utf-8"))["collection"]

        self.assertEqual(embed.call_args.args[0], [records[1]["title"] + "\u3002" + records[1]["content"]])
        self.assertEqual(result["record_count"], 2)
        new = db.collections[result["collection"]]
        self.assertEqual(set(new.rows), {"item:keep", "enemy:change"})
        self.assertEqual(new.rows["item:keep"][2], [1.0, 2.0])
        self.assertEqual(new.rows["enemy:change"][2], [9.0, 9.0])
        self.assertEqual(activated, result["collection"])


class PromptCaptureTests(unittest.IsolatedAsyncioTestCase):
    async def test_blocked_field_question_excludes_old_assistant_answers(self):
        captured = {}

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"choices": [{"message": {"content": json.dumps({
                    "intent": "answer", "answer": "当前图鉴不再提供这项数据。",
                    "character_key": None, "vessel_key": None, "build_scope": None,
                }, ensure_ascii=False)}}]}

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def post(self, url, headers, json):
                captured.update(json)
                return FakeResponse()

        async def inline_threadpool(function, *args, **kwargs):
            return function(*args, **kwargs)

        request = Request({
            "type": "http", "http_version": "1.1", "method": "POST", "scheme": "https",
            "path": "/api/ai/chat", "raw_path": b"/api/ai/chat", "query_string": b"",
            "headers": [], "client": ("127.0.0.1", 1234), "server": ("example.test", 443),
            "root_path": "", "state": {},
        })
        saved = [
            {"role": "user", "content": "\u67d0\u654c\u4eba\u7684\u51fa\u8840\u627f\u53d7\u7387\u662f\u591a\u5c11\uff1f"},
            {"role": "assistant", "content": "\u666e\u901a\u56de\u7b54\uff1a\u5e94\u5bf9\u65b9\u5f0f\u662f\u4fdd\u6301\u8ddd\u79bb\u3002"},
            {"role": "assistant", "content": "\u65e7\u7b54\u6848\uff1a\u51fa\u8840\u627f\u53d7\u7387\u662f 75%\u3002"},
            {"role": "assistant", "content": "出血、冻伤、催眠、发狂的承受值均为0.5，因此这些异常状态也不容易生效。"},
            {"role": "assistant", "content": "承受火焰伤害时要躲避。"},
        ]
        recalled = [
            "\u7528\u6237\u66fe\u95ee\uff1a\u67d0\u654c\u4eba\u7684\u51fa\u8840\u627f\u53d7\u7387\u662f\u591a\u5c11\uff1f\uff1b\u52a9\u624b\u66fe\u7b54\uff1a\u65e7\u7b54\u6848\uff1a\u51fa\u8840\u627f\u53d7\u7387\u662f 75%\u3002",
            "用户曾问：黑剑弱点是什么？；助手曾答：出血、冻伤、催眠、发狂的承受值均为0.5，因此这些异常状态也不容易生效。",
            "\u7528\u6237\u66fe\u95ee\uff1a\u5982\u4f55\u63d0\u9ad8\u751f\u5b58\uff1f\uff1b\u52a9\u624b\u66fe\u7b54\uff1a\u4f18\u5148\u9009\u62e9\u751f\u547d\u503c\u548c\u9632\u5fa1\u8bcd\u6761\u3002",
        ]
        body = main.ChatRequest(
            session_id="00000000-0000-0000-0000-000000000001",
            question="这个敌人的出血承受率是多少？",
        )
        with (
            patch.object(main, "API_KEY", "mock-key"),
            patch.object(main, "run_in_threadpool", side_effect=inline_threadpool),
            patch.object(main, "_reserve_daily_ai_request", new=AsyncMock()),
            patch.object(main.memory_store, "record_ai_request", return_value=None),
            patch.object(main.memory_store, "recent", return_value=saved),
            patch.object(main.memory_store, "recall", return_value=recalled),
            patch.object(main.memory_store, "append_exchange"),
            patch.object(main.rag_store, "search", return_value=[]),
            patch.object(main, "_vessel_catalog", return_value={"characters": {}, "universalVessels": []}),
            patch("backend.main.httpx.AsyncClient", FakeClient),
        ):
            response = await main.chat(body, request)

        self.assertEqual(response["answer"], "当前图鉴不再提供这项数据。")
        messages = captured["messages"]
        serialized = "\n".join(message["content"] for message in messages)
        system_prompt = messages[0]["content"]
        self.assertIn("仅在用户明确询问这五项时，简短说明当前图鉴不提供该数据", system_prompt)
        self.assertIn("普通敌人资料问题不得主动提及这些字段、字段移除或数据缺失", system_prompt)
        self.assertIn("‘物理普通’写作‘普通’，‘猩红腐败’写作‘腐败’", system_prompt)
        self.assertIn("标签直接使用图鉴名称，不添加‘耐受’或‘承受’前缀", system_prompt)
        self.assertIn("不得提供数值或依据其他属性推算", system_prompt)
        self.assertIn("出血承受率", serialized)
        self.assertIn("某敌人的出血承受率是多少？", serialized)
        self.assertNotIn("75%", serialized)
        self.assertNotIn("0.5", serialized)
        user_payload = json.loads(messages[-1]["content"])
        self.assertIn("\u666e\u901a\u56de\u7b54\uff1a\u5e94\u5bf9\u65b9\u5f0f\u662f\u4fdd\u6301\u8ddd\u79bb\u3002", serialized)
        self.assertIn("\u4f18\u5148\u9009\u62e9\u751f\u547d\u503c\u548c\u9632\u5fa1\u8bcd\u6761\u3002", serialized)
        self.assertIn("承受火焰伤害时要躲避。", serialized)
        self.assertEqual([row["role"] for row in user_payload["conversation_history"]], ["user", "assistant", "assistant"])
        self.assertEqual(len(user_payload["relevant_past_conversation"]), 3)


if __name__ == "__main__":
    unittest.main()
