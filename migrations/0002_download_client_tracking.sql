-- Add download client tracking fields to download_history
-- Required by the import pipeline to poll completion and move files

ALTER TABLE download_history ADD COLUMN download_client_id INTEGER REFERENCES download_clients(id);
ALTER TABLE download_history ADD COLUMN external_id TEXT;
