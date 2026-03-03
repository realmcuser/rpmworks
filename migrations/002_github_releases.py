#!/usr/bin/env python3
"""
Migration 002: GitHub Releases support

Adds repo_type and github_repo to the repositories table,
and makes host/username nullable.

Körs normalt automatiskt av main.py vid tjänstestart.

Manuell körning på produktionsservern (RPM-installation):
    DATABASE_URL="postgresql+psycopg://rpmworks:rpmworks@localhost:5432/rpmworks" \
        /opt/rpmworks/backend/venv/bin/python3 /opt/rpmworks/migrations/002_github_releases.py
"""

import os
import sys

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    # Försök läsa från rpmworks.conf (produktionsinstallation)
    conf_path = "/etc/rpmworks/rpmworks.conf"
    if os.path.exists(conf_path):
        with open(conf_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.split("=", 1)[1].strip()
                    break

if not DATABASE_URL:
    print("ERROR: DATABASE_URL saknas.")
    print("Sätt den via miljövariabel eller se till att /etc/rpmworks/rpmworks.conf finns.")
    print()
    print("Exempel:")
    print('  DATABASE_URL="postgresql+psycopg://rpmworks:rpmworks@localhost:5432/rpmworks" \\')
    print("      /opt/rpmworks/backend/venv/bin/python3 migrations/002_github_releases.py")
    sys.exit(1)

STEPS = [
    (
        "Lägg till kolumn repo_type (default 'ssh')",
        "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS repo_type VARCHAR DEFAULT 'ssh'"
    ),
    (
        "Lägg till kolumn github_repo",
        "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_repo VARCHAR"
    ),
    (
        "Gör host nullable",
        "ALTER TABLE repositories ALTER COLUMN host DROP NOT NULL"
    ),
    (
        "Gör username nullable",
        "ALTER TABLE repositories ALTER COLUMN username DROP NOT NULL"
    ),
]

def run_migration():
    from sqlalchemy import create_engine, text
    engine = create_engine(DATABASE_URL)
    try:
        with engine.begin() as conn:
            for description, sql in STEPS:
                print(f"  → {description}...")
                conn.execute(text(sql))
        print("\nMigration 002 tillämpades utan fel.")
    except Exception as e:
        print(f"\nFEL: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("RPMWorks Migration 002 — GitHub Releases-stöd")
    print("=" * 50)
    print(f"Databas: {DATABASE_URL.split('@')[-1]}")  # dölj lösenord i utskrift
    print()
    run_migration()
