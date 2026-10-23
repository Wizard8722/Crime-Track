CREATE TABLE IF NOT EXISTS nrc_reference (
  id BIGSERIAL PRIMARY KEY,
  township_en TEXT NOT NULL,
  township_mm TEXT NOT NULL,
  township_code_en TEXT NOT NULL,
  township_code_mm TEXT NOT NULL,
  state_code INTEGER NOT NULL,
  state_en TEXT NOT NULL,
  state_mm TEXT NOT NULL,
  UNIQUE (state_code, township_code_mm, township_code_en, township_mm, township_en)
);

CREATE TABLE IF NOT EXISTS crime_records (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  nrc_state_code INTEGER NOT NULL,
  nrc_township_code TEXT NOT NULL,
  nrc_reference_id BIGINT REFERENCES nrc_reference(id),
  nrc_type TEXT NOT NULL CHECK (nrc_type IN ('N', 'E', 'P')),
  nrc_number CHAR(6) NOT NULL CHECK (nrc_number ~ '^[0-9]{6}$'),
  date_of_birth DATE,
  gender TEXT,
  crime_date DATE NOT NULL,
  crime_section TEXT NOT NULL DEFAULT '',
  crime_detail TEXT NOT NULL,
  father_name TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE crime_records ADD COLUMN IF NOT EXISTS nrc_reference_id BIGINT REFERENCES nrc_reference(id);
ALTER TABLE crime_records ADD COLUMN IF NOT EXISTS crime_section TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS crime_records_nrc_idx ON crime_records (nrc_state_code, nrc_township_code, nrc_type, nrc_number);
CREATE INDEX IF NOT EXISTS crime_records_nrc_reference_idx ON crime_records (nrc_reference_id, nrc_type, nrc_number);
