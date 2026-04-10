import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function query(text: string, params?: unknown[]) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_watchlist (
      id           SERIAL       PRIMARY KEY,
      ticker       VARCHAR(20)  UNIQUE NOT NULL,
      asset_type   VARCHAR(10)  NOT NULL,
      display_name VARCHAR(100),
      added_at     TIMESTAMP    DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_predictions (
      id                  SERIAL        PRIMARY KEY,
      ticker              VARCHAR(20)   NOT NULL,
      asset_type          VARCHAR(10)   NOT NULL,
      verdict             VARCHAR(10)   NOT NULL,
      confidence          INTEGER       NOT NULL,
      action              VARCHAR(10)   NOT NULL,
      horizon             VARCHAR(20)   NOT NULL,
      price_at_prediction NUMERIC(20,6),
      bull_case           JSONB,
      bear_case           JSONB,
      risk_analysis       JSONB,
      verdict_detail      JSONB,
      summary             TEXT,
      created_at          TIMESTAMP     DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_prediction_outcomes (
      id                  SERIAL        PRIMARY KEY,
      prediction_id       INTEGER       REFERENCES market_predictions(id),
      ticker              VARCHAR(20)   NOT NULL,
      verdict             VARCHAR(10)   NOT NULL,
      confidence          INTEGER       NOT NULL,
      price_at_prediction NUMERIC(20,6),
      price_at_outcome    NUMERIC(20,6),
      correct             BOOLEAN,
      price_change_percent NUMERIC(10,4),
      horizon             VARCHAR(20)   NOT NULL,
      evaluated_at        TIMESTAMP     DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_system_insights (
      id             SERIAL       PRIMARY KEY,
      insight_type   VARCHAR(50),
      ticker         VARCHAR(20),
      content        TEXT         NOT NULL,
      accuracy_stats JSONB,
      created_at     TIMESTAMP    DEFAULT NOW()
    )
  `);
}
