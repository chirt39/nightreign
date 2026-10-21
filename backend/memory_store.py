"""Browser-scoped, persistent conversation history and semantic recall."""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from chromadb.errors import NotFoundError

from backend import rag_store


DEFAULT_DB = Path(__file__).resolve().parent.parent / "local-data" / "agent_memory.sqlite3"
DB_PATH = Path(os.getenv("AGENT_MEMORY_DB", str(DEFAULT_DB)))
COLLECTION = "nightreign_browser_memory"
MAX_EXCHANGES = max(1, int(os.getenv("AGENT_MEMORY_MAX_EXCHANGES", "5")))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    connection.execute("CREATE INDEX IF NOT EXISTS messages_by_session ON messages(session_id, id)")
    connection.execute("""CREATE TABLE IF NOT EXISTS ai_rate_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client TEXT NOT NULL,
        created_at REAL NOT NULL
    )""")
    connection.execute("CREATE INDEX IF NOT EXISTS ai_rate_events_by_client ON ai_rate_events(client, created_at)")
    connection.execute("""CREATE TABLE IF NOT EXISTS ai_daily_usage (
        day TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL
    )""")
    connection.execute("CREATE TABLE IF NOT EXISTS pending_memory_deletions (id TEXT PRIMARY KEY)")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def recent(session_id: str, limit: int = 8) -> list[dict[str, str]]:
    _prune_session(session_id)
    with _connect() as connection:
        rows = connection.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, min(limit, MAX_EXCHANGES * 2)),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def history(session_id: str, limit: int = 80) -> list[dict[str, str]]:
    return recent(session_id, min(limit, MAX_EXCHANGES * 2))


def append_exchange(session_id: str, question: str, answer: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.executemany(
            "INSERT INTO messages(session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            [(session_id, "user", question, timestamp), (session_id, "assistant", answer, timestamp)],
        )
    _prune_session(session_id)
    try:
        _remember_semantically(session_id, question, answer)
    except Exception:
        # Durable SQLite history remains usable if semantic recall is temporarily unavailable.
        pass
    try:
        _flush_pending_memory_deletions()
    except Exception:
        # Pending IDs remain in SQLite and will be retried on later activity.
        pass


def record_ai_request(client: str, per_minute: int) -> bool:
    """Atomically enforce a shared per-client window across API endpoints/workers."""
    now = time.time()
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM ai_rate_events WHERE created_at <= ?", (now - 60,))
        count = connection.execute(
            "SELECT COUNT(*) FROM ai_rate_events WHERE client = ? AND created_at > ?",
            (client, now - 60),
        ).fetchone()[0]
        if count >= per_minute:
            return False
        connection.execute(
            "INSERT INTO ai_rate_events(client, created_at) VALUES (?, ?)", (client, now)
        )
    return True


def consume_daily_ai_request(limit: int) -> bool:
    """Reserve one outbound model request against a persistent UTC daily cap."""
    day = datetime.now(timezone.utc).date().isoformat()
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT request_count FROM ai_daily_usage WHERE day = ?", (day,)
        ).fetchone()
        if row and row[0] >= limit:
            return False
        connection.execute(
            "INSERT INTO ai_daily_usage(day, request_count) VALUES (?, 1) "
            "ON CONFLICT(day) DO UPDATE SET request_count = request_count + 1",
            (day,),
        )
        connection.execute("DELETE FROM ai_daily_usage WHERE day < ?", (day,))
    return True


def _prune_session(session_id: str) -> None:
    """Keep only the newest complete exchanges and queue matching vector deletions."""
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        stale = connection.execute(
            "SELECT id, role FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?",
            (session_id, MAX_EXCHANGES * 2),
        ).fetchall()
        if stale:
            stale_ids = [row["id"] for row in stale]
            vector_ids = [f"{session_id}-{row['id']}" for row in stale if row["role"] == "assistant"]
            if vector_ids:
                connection.executemany(
                    "INSERT OR IGNORE INTO pending_memory_deletions(id) VALUES (?)",
                    [(item,) for item in vector_ids],
                )
            placeholders = ",".join("?" for _ in stale_ids)
            connection.execute(f"DELETE FROM messages WHERE id IN ({placeholders})", stale_ids)
    try:
        _flush_pending_memory_deletions()
    except Exception:
        # Pending IDs remain in SQLite and will be retried on later activity.
        pass


def _flush_pending_memory_deletions() -> None:
    with _connect() as connection:
        pending = [row[0] for row in connection.execute(
            "SELECT id FROM pending_memory_deletions LIMIT 500"
        ).fetchall()]
    if not pending:
        return
    db = rag_store.chroma_client()
    try:
        collection = db.get_collection(name=COLLECTION)
        collection.delete(ids=pending)
    except NotFoundError:
        # The collection is confirmed absent; there are no vectors to retry.
        pass
    with _connect() as connection:
        connection.executemany(
            "DELETE FROM pending_memory_deletions WHERE id = ?", [(item,) for item in pending]
        )


def clear(session_id: str) -> None:
    db = rag_store.chroma_client()
    collections = db.list_collections()
    collection_exists = any(
        getattr(collection, "name", collection) == COLLECTION
        for collection in collections
    )
    if collection_exists:
        collection = db.get_collection(name=COLLECTION)
        collection.delete(where={"session_id": session_id})

    # Keep SQLite history until vector deletion is confirmed. If this SQL
    # transaction fails after Chroma deletion, retrying the delete is safe.
    with _connect() as connection:
        connection.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        connection.execute(
            "DELETE FROM pending_memory_deletions WHERE id LIKE ?", (f"{session_id}-%",)
        )


def _memory_collection():
    return rag_store.chroma_client().get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine", "purpose": "browser_conversation_memory",
                  "embedding_model": rag_store.embedding_model_name()},
    )


def _remember_semantically(session_id: str, question: str, answer: str) -> None:
    vector = rag_store.embed_query(question)
    with _connect() as connection:
        row = connection.execute("SELECT max(id) AS id FROM messages WHERE session_id = ?", (session_id,)).fetchone()
    record_id = f"{session_id}-{row['id']}"
    _memory_collection().upsert(
        ids=[record_id], embeddings=[vector],
        documents=[f"用户曾问：{question}\n助手曾答：{answer[:4000]}"],
        metadatas=[{"session_id": session_id, "question": question, "answer": answer[:4000]}],
    )


def recall(session_id: str, question: str, limit: int = 3) -> list[str]:
    _prune_session(session_id)
    with _connect() as connection:
        active_ids = [
            f"{session_id}-{row[0]}"
            for row in connection.execute(
                "SELECT id FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT ?",
                (session_id, MAX_EXCHANGES),
            ).fetchall()
        ]
    if not active_ids:
        return []
    try:
        collection = rag_store.chroma_client().get_collection(name=COLLECTION)
    except Exception:
        return []
    if not active_ids:
        return []
    hits = collection.query(
        query_embeddings=[rag_store.embed_query(question)],
        n_results=min(len(active_ids), max(limit + 3, 1)),
        where={"session_id": session_id},
        include=["metadatas"],
    )
    recent_questions = {message["content"] for message in recent(session_id, 8) if message["role"] == "user"}
    metadata = hits.get("metadatas", [[]])[0]
    return [f"用户曾问：{row['question']}；助手曾答：{row['answer']}"
            for row in metadata if row.get("question") not in recent_questions][:limit]
