import os
import sqlite3
from dataclasses import dataclass

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception:  # pragma: no cover - optional dependency for SQLite-only installs
    psycopg2 = None
    RealDictCursor = None


def is_postgres(db_url: str) -> bool:
    return db_url.startswith("postgres://") or db_url.startswith("postgresql://")


def _normalize_query(query: str, use_postgres: bool) -> str:
    if not use_postgres:
        return query
    return query.replace("?", "%s")


@dataclass
class DBConnection:
    conn: object
    use_postgres: bool

    def execute(self, query: str, params: tuple | None = None):
        normalized = _normalize_query(query, self.use_postgres)
        if self.use_postgres:
            cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(normalized, params or ())
            return cursor
        return self.conn.execute(normalized, params or ())

    def executemany(self, query: str, params_seq: list[tuple]):
        normalized = _normalize_query(query, self.use_postgres)
        if self.use_postgres:
            cursor = self.conn.cursor()
            cursor.executemany(normalized, params_seq)
            return cursor
        return self.conn.executemany(normalized, params_seq)

    def commit(self) -> None:
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()


def connect_db(db_url: str) -> DBConnection:
    if is_postgres(db_url):
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for Postgres connections")
        return DBConnection(psycopg2.connect(db_url), True)
    return DBConnection(sqlite3.connect(db_url), False)


def set_row_factory(conn: DBConnection) -> None:
    if not conn.use_postgres:
        conn.conn.row_factory = sqlite3.Row
