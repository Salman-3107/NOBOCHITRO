const { getPool } = require('../db');

async function updateMyProfile(req, res) {
  const { displayName, bio, profilePictureUrl, coverPictureUrl } = req.body;
  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `UPDATE AppUser SET DisplayName = NVL(:displayName, DisplayName), Bio = NVL(:bio, Bio),
       ProfilePictureURL = NVL(:profilePictureUrl, ProfilePictureURL), CoverPictureURL = NVL(:coverPictureUrl, CoverPictureURL)
       WHERE UserID = :userId`,
      { displayName: displayName || null, bio: bio ?? null, profilePictureUrl: profilePictureUrl || null, coverPictureUrl: coverPictureUrl || null, userId: req.user.userId },
      { autoCommit: true }
    );
    res.json({ message: 'Profile updated' });
  } catch (error) { console.error('Update profile error:', error); res.status(500).json({ error: 'Failed to update profile' }); }
  finally { if (connection) await connection.close(); }
}

function uploadMyProfileMedia(req, res) {
  const files = req.files || {};
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const profilePictureUrl = files.profilePicture?.[0] ? `${baseUrl}/uploads/profiles/${files.profilePicture[0].filename}` : null;
  const coverPictureUrl = files.coverPicture?.[0] ? `${baseUrl}/uploads/profiles/${files.coverPicture[0].filename}` : null;
  res.json({ profilePictureUrl, coverPictureUrl });
}

module.exports = { updateMyProfile, uploadMyProfileMedia };
