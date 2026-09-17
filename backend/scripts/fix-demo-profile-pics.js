require('dotenv').config();

const oracledb = require('oracledb');
const { initPool, closePool, getPool } = require('../db');

const PROFILE_PIC_STYLES = [
    'thumbs',
    'bottts',
    'pixel-art',
    'fun-emoji',
    'lorelei',
    'notionists'
];

function getProfilePicture(username, index) {

    const style =
        PROFILE_PIC_STYLES[
            index % PROFILE_PIC_STYLES.length
        ];

    const seed = encodeURIComponent(
        `${username}-nobochitro-${index}`
    );

    return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}

async function main() {

    await initPool();

    const pool = getPool();
    const connection = await pool.getConnection();

    try {

        const result = await connection.execute(`
            SELECT UserID, Username
            FROM AppUser
            WHERE Email LIKE '%@demo.nobochitro.local'
            ORDER BY UserID
        `);

        console.log(`Found ${result.rows.length} demo users.`);

        for (let i = 0; i < result.rows.length; i++) {

            // Oracle returns objects when OUT_FORMAT is OBJECT
            const userId = result.rows[i].USERID;
            const username = result.rows[i].USERNAME;

            if (!userId || !username) {
                console.log(
                    `Skipping row ${i}: UserID=${userId}, Username=${username}`
                );
                continue;
            }

            const profilePictureURL =
                getProfilePicture(username, i);

            await connection.execute(
                `
                UPDATE AppUser
                SET ProfilePictureURL = :profilePictureURL
                WHERE UserID = :userId
                `,
                {
                    profilePictureURL,
                    userId
                }
            );

            console.log(
                `Updated ${username}`
            );
        }

        await connection.commit();

        console.log('\n======================================');
        console.log('Profile pictures fixed successfully!');
        console.log('======================================');
        console.log('Existing users were NOT modified.');

    } catch (error) {

        await connection.rollback();

        console.error('\nERROR:');
        console.error(error);

    } finally {

        await connection.close();
        await closePool();
    }
}

main();