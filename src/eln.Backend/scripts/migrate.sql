-- ============================================
-- ELN Database Migration Script
-- Run this ONLY if upgrading an existing database
-- For fresh deployments, this is NOT needed
-- ============================================

-- Template: is_archived column (Req 41)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- MeasurementSeries: lock columns (Req 45)
ALTER TABLE measurement_series ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE measurement_series ADD COLUMN IF NOT EXISTS locked_by INTEGER;
ALTER TABLE measurement_series ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;

-- MeasurementImages: new table (Req 50)
CREATE TABLE IF NOT EXISTS measurement_images (
    id SERIAL PRIMARY KEY,
    measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Verify
SELECT 'Migration complete' AS status;
