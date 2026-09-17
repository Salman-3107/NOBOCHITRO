-- Promotes the seed account to admin. Run AFTER add_isadmin.sql, which
-- creates the column this depends on.
--
-- Registration always creates IsAdmin = 0. This script is the one and only
-- way the first admin comes into existence; every admin after that is
-- promoted by an existing admin through PUT /api/admin/users/:id/role.

UPDATE AppUser SET IsAdmin = 1 WHERE Username = 'admin_1';

-- Sanity check -- should print at least one row.
SELECT UserID, Username, IsAdmin FROM AppUser WHERE IsAdmin = 1;

COMMIT;
