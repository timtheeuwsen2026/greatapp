import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createPostgresConnectionConfig } from './postgres-connection-config.mjs';

test('email migration preserves its TLS policy when the URL specifies sslmode', () => {
  const config = createPostgresConnectionConfig(
    'postgresql://email_user:p%40ss@db.example.com:6543/great?sslmode=verify-full',
  );
  const client = new pg.Client(config);

  assert.deepEqual(config, {
    host: 'db.example.com',
    port: 6543,
    user: 'email_user',
    password: 'p@ss',
    database: 'great',
    ssl: { rejectUnauthorized: false },
  });
  assert.deepEqual(client.connectionParameters.ssl, { rejectUnauthorized: false });
});
