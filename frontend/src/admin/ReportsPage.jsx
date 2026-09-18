import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listReports, getReportedContent, updateReportStatus } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  Modal, MigrationNotice, StatusBadge, formatNumber, formatDateTime,
} from './components/AdminUI';

const STATUSES = ['Pending', 'Reviewed', 'Resolved', 'Rejected'];

// The moderation queue.
//
// ContentReport is one of the three things the original 17-table schema has no
// place for -- "user A reported post B for reason C" cannot be derived from
// anything that exists. It comes from admin_dashboard_extensions.sql, and when
// that hasn't been run this page says so rather than erroring.
export default function ReportsPage() {
  const toast = useToast();
  const [inspecting, setInspecting] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, refresh } =
    useAdminResource(listReports, { page: 1, limit: 20, status: 'Pending' });

  async function inspect(report) {
    setInspecting({ report, content: null, loading: true });
    try {
      const result = await getReportedContent(report.reportId);
      setInspecting({ report, ...result, loading: false });
    } catch (err) {
      setInspecting({ report, content: null, loading: false, error: err.message });
    }
  }

  async function applyStatus(nextStatus) {
    setBusy(true);
    try {
      await updateReportStatus(resolving.reportId, nextStatus, note.trim() || undefined);
      toast.success(`Report marked ${nextStatus.toLowerCase()}.`);
      setResolving(null);
      setNote('');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // `available: false` means the table isn't installed -- not an error, a
  // missing migration step, so it gets instructions rather than a red screen.
  if (data && data.available === false) {
    return (
      <>
        <PageHeader title="Reports" />
        <MigrationNotice feature="The report queue" message={data.message} />
      </>
    );
  }

  const columns = [
    { key: 'id', label: 'ID', render: (report) => `#${report.reportId}` },
    {
      key: 'reporter',
      label: 'Reporter',
      render: (report) => (
        <Link className="adm-link" to={`/admin/users/${report.reporterId}`}>{report.reporterName}</Link>
      ),
    },
    {
      key: 'target',
      label: 'Reported',
      render: (report) => (
        <span>
          <StatusBadge status={report.targetType} tone="info" />{' '}
          {report.targetUserId
            ? <Link className="adm-link" to={`/admin/users/${report.targetUserId}`}>{report.targetUserName}</Link>
            : <span style={{ color: 'var(--text-faint)' }}>#{report.targetId}</span>}
        </span>
      ),
    },
    { key: 'reason', label: 'Reason', render: (report) => <span className="adm-clamp">{report.reason}</span> },
    { key: 'date', label: 'Raised', render: (report) => formatDateTime(report.createdDate) },
    { key: 'status', label: 'Status', render: (report) => <StatusBadge status={report.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (report) => (
        <>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => inspect(report)}>Inspect</button>
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--primary"
            onClick={() => { setNote(report.resolutionNote || ''); setResolving(report); }}
          >
            Action
          </button>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={data ? `${formatNumber(data.total)} reports in this view` : 'Loading…'}
      />

      <div className="adm-filters">
        <select
          className="adm-select" value={params.status || ''}
          onChange={(event) => setFilter({ status: event.target.value })}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
        <select
          className="adm-select" value={params.targetType || ''}
          onChange={(event) => setFilter({ targetType: event.target.value })}
          aria-label="Filter by content type"
        >
          <option value="">All content types</option>
          {['Post', 'Comment', 'Review', 'User'].map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      </div>

      {status === 'loading' && <TableSkeleton rows={6} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && data.available !== false && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(report) => report.reportId}
            emptyState={
              <EmptyState
                icon="✓"
                title="Queue is clear"
                message="No reports match this filter. Nothing is waiting on you."
              />
            }
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="reports"
          />
        </>
      )}

      {inspecting && (
        <Modal
          wide
          title={`Reported ${inspecting.report.targetType.toLowerCase()}`}
          onClose={() => setInspecting(null)}
          footer={<button type="button" className="adm-btn" onClick={() => setInspecting(null)}>Close</button>}
        >
          <p><strong style={{ color: 'var(--text)' }}>Reason:</strong> {inspecting.report.reason}</p>
          {inspecting.report.details && <p>{inspecting.report.details}</p>}

          {inspecting.loading && <span className="adm-skel" style={{ height: 80 }} />}
          {inspecting.error && <p className="adm-field__error">{inspecting.error}</p>}

          {/* A report can outlive the thing it points at -- someone may have
              already deleted the post. That is a legitimate state, not a bug. */}
          {!inspecting.loading && inspecting.missing && (
            <div className="adm-notice">
              <strong>Content no longer exists</strong>
              The reported {inspecting.report.targetType.toLowerCase()} has already been deleted.
              You can close this report as resolved.
            </div>
          )}

          {inspecting.content && (
            <div className="adm-impact" style={{ display: 'block' }}>
              <p style={{ margin: '0 0 8px', color: 'var(--text)' }}>
                <strong>@{inspecting.content.USERNAME}</strong>
                {inspecting.content.TITLE && <> · about <em>{inspecting.content.TITLE}</em></>}
              </p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {inspecting.content.BODY || '(no text)'}
              </p>
            </div>
          )}
        </Modal>
      )}

      {resolving && (
        <Modal
          title={`Action report #${resolving.reportId}`}
          onClose={() => setResolving(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setResolving(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="adm-btn adm-btn--danger" onClick={() => applyStatus('Rejected')} disabled={busy}>
                Reject
              </button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => applyStatus('Resolved')} disabled={busy}>
                Resolve
              </button>
            </>
          }
        >
          <p>
            Resolving records that you acted on this report; rejecting records that no action was
            needed. Either way your account and the time are stamped on it.
          </p>
          <p style={{ fontSize: 12 }}>
            Removing the content itself is a separate step — use Inspect, then the
            Posts, Comments or Reviews screen.
          </p>

          <label className="adm-field">
            <span>Resolution note</span>
            <textarea
              className="adm-textarea" value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional — what you did and why."
            />
          </label>

          <p style={{ fontSize: 12 }}>
            Or mark it{' '}
            <button
              type="button" className="adm-btn adm-btn--sm adm-btn--ghost"
              onClick={() => applyStatus('Reviewed')} disabled={busy}
            >
              Reviewed
            </button>{' '}
            to leave it open while you look into it.
          </p>
        </Modal>
      )}
    </>
  );
}
