import unittest
from unittest.mock import patch

from backend import main, rag_store


class KnowledgeStatusTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_source_categories_and_index_metadata(self):
        records = [
            {"category": "boss"},
            {"category": "weapon"},
            {"category": "boss"},
        ]
        index = {
            "status": "ok",
            "record_count": 3,
            "collection": "active-knowledge",
            "embedding_model": "text-embedding-v4",
        }

        with (
            patch.object(rag_store, "corpus_records", return_value=records),
            patch.object(rag_store, "status", return_value=index),
        ):
            result = await main.knowledge_status()

        self.assertEqual(
            result,
            {
                "status": "ok",
                "record_count": 3,
                "source_record_count": 3,
                "categories": {"boss": 2, "weapon": 1},
                "storage": "Chroma",
                "collection": "active-knowledge",
                "embedding_model": "text-embedding-v4",
            },
        )


if __name__ == "__main__":
    unittest.main()
