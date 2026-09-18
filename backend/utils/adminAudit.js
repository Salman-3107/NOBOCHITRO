// Writes one row to AdminActivityLog per administrative action.
//
// Two deliberate properties:
//
//   1. It never throws. An audit write failing must not roll back the movie
//      edit it was recording -- losing the log line is bad, losing the user's
//      work because of a logging bug is worse. Failures are printed instead.
//
//   2. It does NOT commit. The caller passes its own connection, so the log
//      row joins the same transaction as the action it describes. If the
//      delete rolls back, so does the claim that it happened. Callers must
//      therefore log BEFORE their commit, on the same connection.
//
// If admin_dashboard_extensions.sql hasn't been applied, every call quietly
// does nothing and the Activity page tells the admin why it is empty.

const { hasAuditLog } = require('./adminSchema');

// Column widths from the migration -- longer values are trimmed here rather
// than being bounced back by ORA-12899 mid-transaction.
const LABEL_MAX = 200;
const DETAILS_MAX = 500;

function clip(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

async function logAdminAction(connection, {
  adminId,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  details = null,
}) {
  try {
    if (!(await hasAuditLog(connection))) return;

    await connection.execute(
      `INSERT INTO AdminActivityLog
         (LogID, AdminID, Action, TargetType, TargetID, TargetLabel, Details)
       VALUES
         (seq_adminactivitylog.NEXTVAL, :adminId, :action, :targetType, :targetId, :targetLabel, :details)`,
      {
        adminId: adminId || null,
        action,
        targetType,
        targetId: targetId || null,
        targetLabel: clip(targetLabel, LABEL_MAX),
        details: clip(details, DETAILS_MAX),
      }
    );
  } catch (err) {
    console.error(`Audit log write failed for action "${action}":`, err);
  }
}

module.exports = { logAdminAction };
