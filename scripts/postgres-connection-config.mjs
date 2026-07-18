export function createPostgresConnectionConfig(connectionString) {
  const databaseUrl = new URL(connectionString);

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }

  return {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ''),
    // Parsing fields individually prevents sslmode in DATABASE_URL from
    // replacing this hosted-database certificate policy.
    ssl: { rejectUnauthorized: false },
  };
}
