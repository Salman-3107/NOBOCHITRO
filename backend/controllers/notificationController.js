const oracledb = require('oracledb');
const { getPool } = require('../db');

// Shared helper -- now only used for admin announcements
// (adminEngagementController.broadcastAnnouncement). Follow / like / comment
// notifications are written by database triggers (TRG_NOTIFY_ON_FOLLOW,
// TRG_NOTIFY_ON_POST_LIKE, TRG_NOTIFY_ON_POST_COMMENT), and challenge
// publishing by PROC_PUBLISH_CHALLENGE.
// It runs on the SAME connection/transaction as the caller, so a notification
// never gets created for an action that itself failed.
async function createNotification(connection, userId, notifType, message, relatedId) {
  await connection.execute(
    `INSERT INTO Notification (NotificationID, UserID, NotifType, Message, RelatedID)
     VALUES (seq_notification.NEXTVAL, :userId, :notifType, :message, :relatedId)`,
    { userId, notifType, message, relatedId: relatedId || null }
  );
}

// GET /api/notifications  (auth) -- my own notifications, newest first
async function listNotifications(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT NotificationID, NotifType, Message, RelatedID, IsRead, CreatedDate
       FROM Notification
       WHERE UserID = :userId
       ORDER BY CreatedDate DESC
       FETCH FIRST 50 ROWS ONLY`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/notifications/:id/read  (auth, owner only)
async function markRead(req, res) {
  const notificationId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `UPDATE Notification SET IsRead = 1 WHERE NotificationID = :notificationId AND UserID = :userId`,
      { notificationId, userId }
    );
    if (result.rowsAffected === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Notification not found' });
    }
    await connection.commit();
    res.json({ message: 'Marked as read' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/notifications/read-all  (auth)
async function markAllRead(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `UPDATE Notification SET IsRead = 1 WHERE UserID = :userId AND IsRead = 0`,
      { userId }
    );
    await connection.commit();
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { createNotification, listNotifications, markRead, markAllRead };
