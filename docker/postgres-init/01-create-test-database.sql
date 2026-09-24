-- Creates the integration-test database next to the development one.
-- Runs once, when the data volume is first initialised. To re-run it:
--   docker compose down -v && docker compose up -d
CREATE DATABASE music_app_test_db OWNER bookrough;
