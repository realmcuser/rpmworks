-- Migration 002: GitHub Releases support
-- Adds repo_type and github_repo to the repositories table,
-- and makes host/username nullable (not needed for GitHub repos).
--
-- Safe to run multiple times (uses IF NOT EXISTS / DROP NOT NULL guards).
--
-- ======================================================================
-- OBSERVERA: På produktionsservern kör RPMWorks direkt på OS (ej container)
-- som systemd-tjänst (rpmworks.service) mot lokal PostgreSQL.
-- ======================================================================
--
-- === ALTERNATIV 1: Automatisk (rekommenderat) ===
-- Migreringen körs automatiskt av main.py vid tjänstestart.
-- Installera bara det nya RPM-paketet och starta om tjänsten:
--
--   dnf upgrade rpmworks-*.noarch.rpm
--   systemctl restart rpmworks
--
-- === ALTERNATIV 2: Manuell via psql (om automatiken inte funkar) ===
--
-- Som rpmworks-användaren (har rätt till databasen):
--   psql "postgresql://rpmworks:rpmworks@localhost:5432/rpmworks" \
--     -c "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS repo_type VARCHAR DEFAULT 'ssh'"
--   psql "postgresql://rpmworks:rpmworks@localhost:5432/rpmworks" \
--     -c "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_repo VARCHAR"
--   psql "postgresql://rpmworks:rpmworks@localhost:5432/rpmworks" \
--     -c "ALTER TABLE repositories ALTER COLUMN host DROP NOT NULL"
--   psql "postgresql://rpmworks:rpmworks@localhost:5432/rpmworks" \
--     -c "ALTER TABLE repositories ALTER COLUMN username DROP NOT NULL"
--
-- Eller via postgres-systemanvändaren (utan lösenord):
--   sudo -u postgres psql -d rpmworks \
--     -c "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS repo_type VARCHAR DEFAULT 'ssh'"
--   sudo -u postgres psql -d rpmworks \
--     -c "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_repo VARCHAR"
--   sudo -u postgres psql -d rpmworks \
--     -c "ALTER TABLE repositories ALTER COLUMN host DROP NOT NULL"
--   sudo -u postgres psql -d rpmworks \
--     -c "ALTER TABLE repositories ALTER COLUMN username DROP NOT NULL"
--
-- === ALTERNATIV 3: Via Python-skriptet i RPMWorks venv ===
--
--   DATABASE_URL="postgresql+psycopg://rpmworks:rpmworks@localhost:5432/rpmworks" \
--     /opt/rpmworks/backend/venv/bin/python3 /opt/rpmworks/migrations/002_github_releases.py
--
-- === Verifiera att migreringen är tillämpad ===
--   sudo -u postgres psql -d rpmworks -c "\d repositories"
--   (repo_type och github_repo ska finnas, host/username ska vara nullable)

BEGIN;

ALTER TABLE repositories
    ADD COLUMN IF NOT EXISTS repo_type VARCHAR DEFAULT 'ssh';

ALTER TABLE repositories
    ADD COLUMN IF NOT EXISTS github_repo VARCHAR;

ALTER TABLE repositories
    ALTER COLUMN host DROP NOT NULL;

ALTER TABLE repositories
    ALTER COLUMN username DROP NOT NULL;

COMMIT;
