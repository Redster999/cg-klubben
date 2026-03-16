const { Pool } = require('pg');

let pool;
let schemaReady = false;

function getPool() {
  if (pool) {
    return pool;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  return pool;
}

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        employee_number TEXT NOT NULL UNIQUE,
        is_board BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE members
      ADD COLUMN IF NOT EXISTS is_board BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wall_posts (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_role TEXT NOT NULL CHECK (author_role IN ('styret', 'member')),
        show_on_frontpage BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS show_on_frontpage BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS author_member_id BIGINT;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS target_member_id BIGINT;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS responded_by_member_id BIGINT;
    `);

    await client.query(`
      ALTER TABLE wall_posts
      ADD COLUMN IF NOT EXISTS responded_by_name TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS online_presence (
        session_nonce TEXT PRIMARY KEY,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL CHECK (user_role IN ('styret', 'member')),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        headline TEXT DEFAULT '',
        published BOOLEAN NOT NULL DEFAULT TRUE,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO site_settings (id, headline, published, details)
      VALUES (1, '', TRUE, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query('COMMIT');
    schemaReady = true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = {
  query,
};
