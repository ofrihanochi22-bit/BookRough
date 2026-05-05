-- This script runs once on the first boot of the Postgres container (when the volume is empty).
-- It creates the separate test database used by integration tests so they never touch the dev DB.
CREATE DATABASE music_app_test OWNER bookrough;
