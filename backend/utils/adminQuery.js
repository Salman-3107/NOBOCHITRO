// Shared query plumbing for the admin list endpoints.
//
// Every admin table is server-side paginated -- the brief asks for
// "Showing 1-20 of 1,284", and fetching 1,284 rows to display 20 of them is
// the one thing guaranteed to make the dashboard feel slow once the catalogue
// grows.
//
// The important rule in this file: a bind variable can carry a VALUE into
// Oracle, but it can never carry an IDENTIFIER. `ORDER BY :column` does not
// sort by that column, it sorts by a constant string. So sort columns have to
// be interpolated -- which is exactly where an injection would get in. Hence
// `resolveSort`: the caller supplies a map of {apiName -> literal SQL}, and
// anything not in that map falls back to the default. The request never
// reaches the SQL text; only a key lookup into a map the developer wrote does.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ?page=2&limit=20 -> { page, limit, offset }
function parsePagination(query, { defaultLimit = DEFAULT_PAGE_SIZE } = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_PAGE_SIZE)
    : defaultLimit;

  return { page, limit, offset: (page - 1) * limit };
}

// Turns ?sort=title&order=desc into a safe ORDER BY fragment.
//
//   allowed  { title: 'm.Title', year: 'm.ReleaseYear' }
//   fallback the key to use when ?sort= is missing or unrecognised
//
// `tieBreaker` keeps paging stable: Oracle gives no guaranteed order among
// rows with equal sort keys, so without it the same row can appear on page 1
// and page 2 while another never appears at all.
function resolveSort(query, allowed, fallbackKey, tieBreaker) {
  const key = Object.prototype.hasOwnProperty.call(allowed, query.sort)
    ? query.sort
    : fallbackKey;

  const direction = String(query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const column = allowed[key];

  const clause = tieBreaker
    ? `${column} ${direction} NULLS LAST, ${tieBreaker}`
    : `${column} ${direction} NULLS LAST`;

  return { key, direction: direction.toLowerCase(), clause };
}

// Oracle 12c+ row limiting. Appended after ORDER BY.
const PAGE_CLAUSE = 'OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';

// Wraps a free-text search term for a case-insensitive LIKE. Returns null for
// blank input so callers can skip the condition entirely.
//
// The escape matters: a user typing "100%" into the search box would otherwise
// match every row, and "_" would match any single character. Callers pair this
// with ESCAPE '\' in the SQL.
function likeTerm(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const escaped = trimmed.replace(/([\\%_])/g, '\\$1');
  return `%${escaped}%`;
}

// Standard envelope for every paginated admin response, so the frontend's
// table component can consume them all identically.
function paginated(items, total, { page, limit }) {
  return {
    available: true,
    items,
    total,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
  };
}

// A positive integer route/query param, or null.
function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Oracle DATE has no time zone. The frontend sends ISO strings; anything
// unparseable becomes null rather than an Invalid Date, which oracledb would
// reject with a confusing NJS error.
function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Maps the Oracle errors the admin CRUD screens actually provoke onto plain
// sentences. Section 29 of the brief: never show a raw ORA- string to a user.
//
// Returns null when the error is not one of the recognised constraint
// failures, which is the caller's signal to log it and send a generic 500.
function describeOracleError(err, context = {}) {
  switch (err.errorNum) {
    case 1: // ORA-00001 unique constraint
      return { status: 409, error: context.duplicate || 'That record already exists.' };
    case 1400: // ORA-01400 cannot insert NULL
      return { status: 400, error: 'A required field was left empty.' };
    case 2291: // ORA-02291 parent key not found
      return { status: 404, error: context.missingParent || 'A referenced record no longer exists.' };
    case 2292: // ORA-02292 child record found
      return {
        status: 409,
        error: context.hasChildren
          || 'This record is still referenced by other data and cannot be removed.',
      };
    case 2290: // ORA-02290 check constraint
      return { status: 400, error: context.checkFailed || 'One of the values is outside the allowed range.' };
    case 12899: // ORA-12899 value too large for column
      return { status: 400, error: 'One of the values is too long for the field it belongs to.' };
    default:
      return null;
  }
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_CLAUSE,
  parsePagination,
  resolveSort,
  likeTerm,
  paginated,
  parseId,
  parseDate,
  describeOracleError,
};
