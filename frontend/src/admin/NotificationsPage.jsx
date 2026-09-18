import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listNotifications, sendAnnouncement } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  Modal, ConfirmModal, StatusBadge, formatNumber, formatDateTime,
} from './components/AdminUI';

// Notification.Message is VARCHAR2(255).
const MAX_LENGTH = 255;

export default function NotificationsPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, refresh } =
    useAdminResource(listNotifications, {
      page: 1, limit: 20, userId: urlParams.get('userId') || '',
    });

  async function send() {
    setBusy(true);
    try {
      const result = await sendAnnouncement(message.trim());
      toast.success(result.message);
      setConfirming(false);
      setComposing(false);
      setMessage('');
      refresh();
    } catch (err) {
      toast.error(err.message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'user',
      label: 'Recipient',
      render: (notification) => (
        <Link className="adm-link" to={`/admin/users/${notification.userId}`}>
          {notification.displayName || notification.username}
        </Link>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (notification) => <StatusBadge status={notification.notifType} tone="info" />,
    },
    { key: 'message', label: 'Message', render: (notification) => <span className="adm-clamp">{notification.message}</span> },
    {
      key: 'read',
      label: 'Read',
      render: (notification) => (
        notification.isRead
          ? <StatusBadge status="Read" tone="neutral" />
          : <StatusBadge status="Unread" tone="warn" />
      ),
    },
    { key: 'date', label: 'Sent', render: (notification) => formatDateTime(notification.createdDate) },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${formatNumber(data.total)} notifications sent` : 'Loading…'}
      >
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => setComposing(true)}>
          New announcement
        </button>
      </PageHeader>

      <div className="adm-filters">
        <select
          className="adm-select" value={params.type || ''}
          onChange={(event) => setFilter({ type: event.target.value })}
          aria-label="Filter by type"
        >
          {/* Built from what has actually been sent, so the filter never
              offers a category the backend doesn't produce. */}
          <option value="">All types</option>
          {data?.types?.map((entry) => (
            <option key={entry.type} value={entry.type}>
              {entry.type} ({formatNumber(entry.count)})
            </option>
          ))}
        </select>
        {params.userId && (
          <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setFilter({ userId: '' })}>
            Clear user filter
          </button>
        )}
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(notification) => notification.notificationId}
            emptyState={<EmptyState icon="🔔" title="No notifications sent yet" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="notifications"
          />
        </>
      )}

      {composing && (
        <Modal
          title="Send announcement"
          onClose={() => setComposing(false)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setComposing(false)}>Cancel</button>
              <button
                type="button" className="adm-btn adm-btn--primary"
                disabled={!message.trim() || message.length > MAX_LENGTH}
                onClick={() => setConfirming(true)}
              >
                Review &amp; send
              </button>
            </>
          }
        >
          {/* The Notification table has UserID and NotifType and no concept of
              a segment, so "All users" is the only audience the schema can
              honour. One real option beats four fictional ones. */}
          <label className="adm-field">
            <span>Target audience</span>
            <input className="adm-input" value="All users" readOnly />
          </label>

          <label className="adm-field">
            <span>Message <span className="adm-req">*</span></span>
            <textarea
              className="adm-textarea" value={message} autoFocus
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. NOBOCHITRO will be down for maintenance on Sunday from 2am."
            />
            <p
              className="adm-panel__note"
              style={{ color: message.length > MAX_LENGTH ? 'var(--error)' : undefined }}
            >
              {message.length} / {MAX_LENGTH} characters
            </p>
          </label>
        </Modal>
      )}

      {confirming && (
        <ConfirmModal
          title="Send to every user?"
          message={`This delivers one notification to every registered account and cannot be recalled. Message: "${message.trim()}"`}
          confirmLabel="Send announcement"
          busy={busy}
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
