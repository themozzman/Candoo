import argparse
import os
import sqlite3
from typing import Iterable

import psycopg2
from psycopg2.extras import execute_values


TABLES: list[tuple[str, list[str]]] = [
    ("users", ["id", "username", "email", "password_hash", "created_at", "verified_at"]),
    ("courses", ["id", "name", "subtitle", "description", "active_flow_id", "created_at"]),
    ("ai_specs", ["id", "course_id", "topic", "spec_json", "status", "created_at"]),
    ("ai_flows", ["id", "spec_id", "course_id", "flow_json", "status", "created_at", "approved_at"]),
    ("user_courses", ["user_id", "course_id", "created_at"]),
    ("sessions", ["session_id", "flow_id", "student_id", "current_step_id", "created_at", "attempts"]),
    (
        "attempts",
        [
            "id",
            "session_id",
            "flow_id",
            "student_id",
            "step_id",
            "response",
            "correct",
            "skipped",
            "attempt_number",
            "time_spent_ms",
            "created_at",
        ],
    ),
    ("auth_sessions", ["session_id", "user_id", "created_at", "expires_at"]),
    ("password_resets", ["id", "user_id", "token_hash", "created_at", "expires_at", "used_at"]),
    ("email_verifications", ["id", "user_id", "code_hash", "created_at", "expires_at", "used_at"]),
]


def _sqlite_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {row[0] for row in rows}


def _table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [row[1] for row in rows]


def _fetch_rows(conn: sqlite3.Connection, table: str, columns: Iterable[str]) -> list[tuple]:
    available = set(_table_columns(conn, table))
    selected = [col for col in columns if col in available]
    if not selected:
        return []
    cols = ", ".join(selected)
    rows = conn.execute(f"SELECT {cols} FROM {table}").fetchall()
    if len(selected) == len(columns):
        return rows
    indices = [selected.index(col) if col in selected else None for col in columns]
    normalized = []
    for row in rows:
        normalized.append(tuple(row[idx] if idx is not None else None for idx in indices))
    return normalized


def _truncate_tables(pg_conn, tables: Iterable[str]) -> None:
    table_list = ", ".join(tables)
    with pg_conn.cursor() as cursor:
        cursor.execute(f"TRUNCATE {table_list} CASCADE")
    pg_conn.commit()


def _set_sequence(pg_conn, table: str, id_column: str = "id") -> None:
    sequence_name = f"{table}_{id_column}_seq"
    with pg_conn.cursor() as cursor:
        cursor.execute(
            f"SELECT MAX({id_column}) FROM {table}"
        )
        max_id = cursor.fetchone()[0]
        if max_id is not None:
            cursor.execute(
                "SELECT setval(%s, %s)",
                (sequence_name, max_id),
            )
    pg_conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate SQLite data to Postgres.")
    parser.add_argument(
        "--sqlite",
        default=os.environ.get("SQLITE_PATH", "backend/storage/app.db"),
        help="Path to SQLite database (default: backend/storage/app.db)",
    )
    parser.add_argument(
        "--postgres",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres DATABASE_URL (default: env DATABASE_URL)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Truncate Postgres tables before inserting",
    )
    args = parser.parse_args()

    if not args.postgres:
        raise SystemExit("DATABASE_URL is required for Postgres migration.")

    sqlite_conn = sqlite3.connect(args.sqlite)
    try:
        pg_conn = psycopg2.connect(args.postgres)
    except Exception as exc:
        sqlite_conn.close()
        raise

    try:
        sqlite_tables = _sqlite_tables(sqlite_conn)
        table_names = [name for name, _ in TABLES if name in sqlite_tables]

        if args.force and table_names:
            _truncate_tables(pg_conn, table_names)

        for table, columns in TABLES:
            if table not in sqlite_tables:
                continue
            rows = _fetch_rows(sqlite_conn, table, columns)
            if not rows:
                continue

            cols = ", ".join(columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_sql = f"INSERT INTO {table} ({cols}) VALUES %s"
            with pg_conn.cursor() as cursor:
                execute_values(cursor, insert_sql, rows)
            pg_conn.commit()

        for table, columns in TABLES:
            if "id" in columns and table in sqlite_tables:
                _set_sequence(pg_conn, table, "id")
    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
