// Runtime schema probes.
//
// Three admin features (Reports, the Activity Log, and the Draft -> Publish
// challenge flow) need tables/columns that database/admin_dashboard_extensions.sql
// adds. Someone who clones the repo and runs only the original scripts should
// still get a working dashboard, with those three panels saying "run this
// migration" rather than the whole page dying on ORA-00942.
//
// The answers are cached for the life of the process: a table does not appear
// or disappear while the server is running, and USER_TABLES is not something
// to query on every request.

const cache = new Map();

async function lookup(connection, key, sql, binds) {
  if (cache.has(key)) return cache.get(key);

  try {
    const result = await connection.execute(sql, binds);
    const exists = result.rows[0].TOTAL > 0;
    cache.set(key, exists);
    return exists;
  } catch (err) {
    // A failure to probe is not a failure to answer -- treat it as absent so
    // the caller degrades, and do NOT cache it, so a transient error doesn't
    // disable the feature until the next restart.
    console.error(`Schema probe failed for ${key}:`, err);
    return false;
  }
}

// Table names are compared upper-case because that is how Oracle stores
// unquoted identifiers.
function hasTable(connection, tableName) {
  const name = tableName.toUpperCase();
  return lookup(
    connection,
    `table:${name}`,
    `SELECT COUNT(*) AS Total FROM user_tables WHERE table_name = :name`,
    { name }
  );
}

function hasColumn(connection, tableName, columnName) {
  const table = tableName.toUpperCase();
  const column = columnName.toUpperCase();

  return lookup(
    connection,
    `column:${table}.${column}`,
    `SELECT COUNT(*) AS Total FROM user_tab_columns
      WHERE table_name = :tableName AND column_name = :columnName`,
    { tableName: table, columnName: column }
  );
}

// Convenience wrappers for the three things the dashboard asks about, so
// controllers don't repeat the literal names.
const hasReports = (connection) => hasTable(connection, 'ContentReport');
const hasAuditLog = (connection) => hasTable(connection, 'AdminActivityLog');
const hasChallengeStatus = (connection) => hasColumn(connection, 'Challenge', 'Status');

// The standard body for an endpoint whose backing table isn't there yet.
// 200 rather than 500: nothing is broken, the feature simply isn't installed,
// and the frontend renders an instruction panel off the `available` flag.
function featureUnavailable(res, feature, script = 'database/admin_dashboard_extensions.sql') {
  return res.json({
    available: false,
    feature,
    message: `This feature needs a schema addition that has not been applied yet. Run ${script} against the NOBOCHITRO database, then reload.`,
    items: [],
    total: 0,
  });
}

// Test hook -- lets a script clear the memo after applying the migration
// without restarting the whole server.
function resetSchemaCache() {
  cache.clear();
}

module.exports = {
  hasTable,
  hasColumn,
  hasReports,
  hasAuditLog,
  hasChallengeStatus,
  featureUnavailable,
  resetSchemaCache,
};
