require('dotenv').config();

const bcrypt = require('bcrypt');
const oracledb = require('oracledb');

const {
  initPool,
  closePool,
  getPool
} = require('../db');


// ============================================================
// SETTINGS
// ============================================================

const USER_COUNT = 100;
const MOVIES_PER_USER = 50;

const DEMO_PASSWORD = 'Demo@123';


// ============================================================
// RANDOM PROFILE PICTURE STYLES
// ============================================================

const PROFILE_PIC_STYLES = [
  'adventurer',
  'avataaars',
  'bottts',
  'croodles',
  'fun-emoji',
  'lorelei',
  'micah',
  'notionists',
  'pixel-art',
  'thumbs'
];


function getRandomProfilePicture(username, userIndex) {

  const style =
    PROFILE_PIC_STYLES[
      userIndex % PROFILE_PIC_STYLES.length
    ];

  const seed =
    encodeURIComponent(
      `${username}-${userIndex}-nobochitro`
    );

  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}


// ============================================================
// 100 NATURAL NAMES
// ============================================================

const FIRST_NAMES = [
  'Ayaan',
  'Nafis',
  'Rafi',
  'Tahsin',
  'Arham',
  'Adnan',
  'Fahad',
  'Sami',
  'Rayhan',
  'Zayan',
  'Nabil',
  'Araf',
  'Sakib',
  'Farhan',
  'Ibrahim',
  'Mahir',
  'Rayan',
  'Abrar',
  'Shafin',
  'Nayeem',
  'Tasin',
  'Afnan',
  'Imran',
  'Hasan',
  'Fardin',
  'Mehedi',
  'Jubayer',
  'Anik',
  'Siam',
  'Ridwan',
  'Mushfiq',
  'Noman',
  'Saad',
  'Shadman',
  'Faisal',
  'Arif',
  'Tamzid',
  'Sohan',
  'Mahin',
  'Raihan',
  'Tania',
  'Sabrina',
  'Nusrat',
  'Mim',
  'Jannat',
  'Samia',
  'Sumaiya',
  'Maliha',
  'Nadia',
  'Raisa',
  'Anika',
  'Tasnia',
  'Fariha',
  'Mehjabin',
  'Sanjida',
  'Rafia',
  'Nabila',
  'Afsana',
  'Tasmia',
  'Mahi',
  'Ishrat',
  'Moumita',
  'Rumana',
  'Sadia',
  'Labiba',
  'Zarin',
  'Jerin',
  'Sohana',
  'Tanjila',
  'Orin',
  'Puja',
  'Sanjana',
  'Nafisa',
  'Alvi',
  'Shafinaz',
  'Arisha',
  'Inaya',
  'Maisha',
  'Safiya',
  'Esha',
  'Ariyan',
  'Nihal',
  'Yusuf',
  'Ovi',
  'Tanvir',
  'Rashed',
  'Amin',
  'Shuvo',
  'Abeer',
  'Nirjon',
  'Rahat',
  'Muntasir',
  'Zubair',
  'Asif',
  'Khalid',
  'Sajid',
  'Ahsan',
  'Rifat',
  'Mahadi'
];


const LAST_NAMES = [
  'Rahman',
  'Ahmed',
  'Hasan',
  'Karim',
  'Chowdhury',
  'Islam',
  'Hossain',
  'Khan',
  'Mahmud',
  'Sarker',
  'Kabir',
  'Alam',
  'Mia',
  'Rashid',
  'Haque',
  'Bhuiyan',
  'Jahan',
  'Noman',
  'Talukder',
  'Roy',
  'Das',
  'Siddique',
  'Anwar',
  'Faruq',
  'Uddin',
  'Molla',
  'Akter',
  'Sultana',
  'Begum',
  'Amin',
  'Bashar',
  'Zaman',
  'Morshed',
  'Azad',
  'Kamal',
  'Salam',
  'Parvez',
  'Nasir',
  'Reza',
  'Sharif',
  'Arefin',
  'Mannan',
  'Jamal',
  'Rony',
  'Mostafa'
];


// ============================================================
// TASTE GROUPS
// ============================================================

const TASTE_GROUPS = [

  {
    name: 'Action',
    preferred: [
      'action',
      'adventure'
    ],
    secondary: [
      'thriller',
      'science fiction',
      'sci-fi',
      'crime'
    ]
  },

  {
    name: 'Drama',
    preferred: [
      'drama',
      'history',
      'historical'
    ],
    secondary: [
      'romance',
      'music',
      'crime'
    ]
  },

  {
    name: 'Sci-Fi',
    preferred: [
      'science fiction',
      'sci-fi',
      'fantasy'
    ],
    secondary: [
      'action',
      'adventure',
      'mystery'
    ]
  },

  {
    name: 'Thriller',
    preferred: [
      'thriller',
      'mystery'
    ],
    secondary: [
      'crime',
      'horror',
      'action'
    ]
  },

  {
    name: 'Crime',
    preferred: [
      'crime'
    ],
    secondary: [
      'thriller',
      'drama',
      'action'
    ]
  },

  {
    name: 'Comedy',
    preferred: [
      'comedy',
      'animation'
    ],
    secondary: [
      'family',
      'romance'
    ]
  },

  {
    name: 'Romance',
    preferred: [
      'romance'
    ],
    secondary: [
      'drama',
      'comedy',
      'music'
    ]
  },

  {
    name: 'Horror',
    preferred: [
      'horror',
      'mystery'
    ],
    secondary: [
      'thriller',
      'fantasy'
    ]
  }

];


// ============================================================
// REVIEW TEXT
// ============================================================

const REVIEW_TEMPLATES = {

  high: [

    'Really enjoyed this one. The story kept me interested from beginning to end.',

    'Excellent movie. Great characters, strong direction, and very rewatchable.',

    'This was a fantastic watch. The atmosphere and storytelling worked really well.',

    'Loved it. The movie delivered exactly the kind of experience I was looking for.',

    'One of those movies that stays in your head after the credits.',

    'Very impressive. The performances and overall filmmaking were excellent.',

    'A great movie night choice. I would definitely watch this again.',

    'The pacing, acting, and story came together nicely. Really enjoyed it.'

  ],

  mid: [

    'Pretty enjoyable overall. It had some great moments even if it was not perfect.',

    'A decent watch with a few memorable scenes. I liked the overall idea.',

    'Good movie for a relaxed evening. Some parts worked better than others.',

    'I enjoyed it, although a few parts felt a little uneven.',

    'Solid movie with some strong moments and a few things I would change.',

    'Interesting watch. Not my favorite, but I can see why people enjoy it.'

  ],

  low: [

    'Not really my kind of movie. A few moments were interesting though.',

    'It had some potential, but the execution did not work for me.',

    'I wanted to like this more. Some parts were good, but overall it felt average.',

    'Probably would not rewatch this one, although it was not completely bad.',

    'The concept was interesting, but the movie did not fully click with me.'

  ]

};


// ============================================================
// POST TEXT
// ============================================================

const POST_TEMPLATES = {

  high: [

    'Just watched {TITLE} and I really enjoyed it. The storytelling was excellent.',

    '{TITLE} was such a good watch. Definitely one I would recommend to other movie fans.',

    'Finished {TITLE} tonight. Loved the atmosphere and the way the story unfolded.',

    'My thoughts after watching {TITLE}: great movie, great performances, and very memorable.',

    '{TITLE} surprised me in a good way. I would happily watch it again.',

    'Movie night pick: {TITLE}. Really enjoyed this one from start to finish.'

  ],

  mid: [

    'Watched {TITLE} today. Pretty solid overall and it had some really good moments.',

    '{TITLE} was an interesting watch. Not perfect, but I enjoyed parts of it.',

    'Finally watched {TITLE}. I liked the idea and some of the scenes were great.',

    'Thoughts on {TITLE}: decent movie with a few memorable moments.',

    '{TITLE} was better than I expected in some places, although it had a few weak spots.'

  ],

  low: [

    'Gave {TITLE} a watch today. It was not really my thing, but I can see the appeal.',

    'Watched {TITLE}. Some interesting ideas, although the movie did not fully work for me.',

    'My take on {TITLE}: a few good moments, but overall it was not a favorite.',

    'Finished {TITLE}. I wanted to enjoy it more, but it did not quite click with me.'

  ]

};


// ============================================================
// HELPERS
// ============================================================

function normalizeGenre(value) {

  return String(value || '')
    .trim()
    .toLowerCase();

}


function hashString(input) {

  let hash = 2166136261;

  for (
    let i = 0;
    i < input.length;
    i++
  ) {

    hash ^= input.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        16777619
      );

  }

  return hash >>> 0;

}


function seededRandom(seed) {

  let x =
    seed >>> 0;

  return function () {

    x += 0x6D2B79F5;

    let t = x;

    t =
      Math.imul(
        t ^ (t >>> 15),
        t | 1
      );

    t ^=
      t +
      Math.imul(
        t ^ (t >>> 7),
        t | 61
      );

    return (
      (t ^ (t >>> 14)) >>> 0
    ) / 4294967296;

  };

}


function pick(
  array,
  random
) {

  return array[
    Math.floor(
      random() *
      array.length
    )
  ];

}


function randomDate(
  random,
  daysBack = 120
) {

  const now =
    Date.now();

  const millisecondsBack =
    Math.floor(
      random() *
      daysBack *
      24 *
      60 *
      60 *
      1000
    );

  return new Date(
    now -
    millisecondsBack
  );

}


function slugify(value) {

  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '_'
    )
    .replace(
      /^_+|_+$/g,
      '');

}


// ============================================================
// BUILD UNIQUE NAMES
// ============================================================

function buildNames() {

  const names = [];

  const used =
    new Set();


  let i = 0;


  while (
    names.length <
    USER_COUNT
  ) {

    const first =
      FIRST_NAMES[
        i % FIRST_NAMES.length
      ];

    const last =
      LAST_NAMES[
        (i * 7 + 3) %
        LAST_NAMES.length
      ];


    const full =
      `${first} ${last}`;


    if (
      !used.has(
        full.toLowerCase()
      )
    ) {

      used.add(
        full.toLowerCase()
      );

      names.push(
        full
      );

    }


    i++;

  }


  return names;

}


// ============================================================
// GET TASTE GROUP
// ============================================================

function getTasteGroup(
  index
) {

  return TASTE_GROUPS[
    index %
    TASTE_GROUPS.length
  ];

}


// ============================================================
// GENRE SCORE
// ============================================================

function movieGenreScore(
  movie,
  tasteGroup
) {

  const genres =
    movie.genres;


  if (
    genres.some(
      g =>
        tasteGroup.preferred.includes(g)
    )
  ) {

    return 3;

  }


  if (
    genres.some(
      g =>
        tasteGroup.secondary.includes(g)
    )
  ) {

    return 2;

  }


  return 1;

}


// ============================================================
// CHOOSE 50 MOVIES
// ============================================================

function chooseMoviesForUser(
  movies,
  tasteGroup,
  userIndex
) {

  if (
    movies.length <
    MOVIES_PER_USER
  ) {

    throw new Error(
      `Need at least ${MOVIES_PER_USER} movies. ` +
      `Only ${movies.length} found.`
    );

  }


  const scored =
    movies.map(
      movie => {

        const genreScore =
          movieGenreScore(
            movie,
            tasteGroup
          );


        const random =
          seededRandom(
            hashString(
              `${userIndex}-${movie.movieId}`
            )
          );


        return {

          movie,

          score:
            genreScore * 100 +
            random() * 50

        };

      }
    );


  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );


  const preferredCount =
    Math.min(
      32,
      MOVIES_PER_USER
    );


  const selected =
    scored
      .slice(
        0,
        preferredCount
      )
      .map(
        x => x.movie
      );


  const selectedIds =
    new Set(
      selected.map(
        m => m.movieId
      )
    );


  const remaining =
    scored.filter(
      x =>
        !selectedIds.has(
          x.movie.movieId
        )
    );


  const random =
    seededRandom(
      hashString(
        `remaining-${userIndex}`
      )
    );


  while (
    selected.length <
      MOVIES_PER_USER &&
    remaining.length > 0
  ) {

    const index =
      Math.floor(
        random() *
        remaining.length
      );


    const item =
      remaining.splice(
        index,
        1
      )[0];


    selected.push(
      item.movie
    );

  }


  return selected;

}


// ============================================================
// RATING
// ============================================================

function ratingForMovie(
  movie,
  tasteGroup,
  userIndex
) {

  const score =
    movieGenreScore(
      movie,
      tasteGroup
    );


  const random =
    seededRandom(
      hashString(
        `rating-${userIndex}-${movie.movieId}`
      )
    );


  const noise =
    (random() - 0.5) * 2;


  let base;


  if (score === 3) {

    base = 9;

  }
  else if (score === 2) {

    base = 7.5;

  }
  else {

    base = 5.5;

  }


  let rating =
    Math.round(
      base + noise
    );


  rating =
    Math.max(
      1,
      Math.min(
        10,
        rating
      )
    );


  return rating;

}


// ============================================================
// REVIEW TEXT
// ============================================================

function reviewTextForRating(
  rating,
  movieTitle,
  random
) {

  let bucket;


  if (
    rating >= 8
  ) {

    bucket = 'high';

  }
  else if (
    rating >= 6
  ) {

    bucket = 'mid';

  }
  else {

    bucket = 'low';

  }


  const text =
    pick(
      REVIEW_TEMPLATES[bucket],
      random
    );


  return (
    `${text} ` +
    `${movieTitle} gets a ${rating}/10 from me.`
  );

}


// ============================================================
// POST TEXT
// ============================================================

function postTextForRating(
  rating,
  movieTitle,
  random
) {

  let bucket;


  if (
    rating >= 8
  ) {

    bucket = 'high';

  }
  else if (
    rating >= 6
  ) {

    bucket = 'mid';

  }
  else {

    bucket = 'low';

  }


  return pick(
    POST_TEMPLATES[bucket],
    random
  ).replace(
    '{TITLE}',
    movieTitle
  );

}


// ============================================================
// LOAD MOVIES + GENRES
// ============================================================

async function loadMovies(
  connection
) {

  const result =
    await connection.execute(`

      SELECT
        m.MovieID,
        m.Title,
        g.GenreName

      FROM Movie m

      LEFT JOIN MovieGenre mg
        ON mg.MovieID = m.MovieID

      LEFT JOIN Genre g
        ON g.GenreID = mg.GenreID

      ORDER BY m.MovieID

    `);


  const movieMap =
    new Map();


  for (
    const row of result.rows
  ) {

    const movieId =
      Number(
        row.MOVIEID
      );


    if (
      !movieMap.has(movieId)
    ) {

      movieMap.set(
        movieId,
        {

          movieId,

          title:
            row.TITLE,

          genres: []

        }
      );

    }


    if (
      row.GENRENAME
    ) {

      movieMap
        .get(movieId)
        .genres
        .push(
          normalizeGenre(
            row.GENRENAME
          )
        );

    }

  }


  return Array.from(
    movieMap.values()
  );

}


// ============================================================
// CREATE USERS
//
// NOTHING IS DELETED.
// NOTHING IS UPDATED.
// ============================================================

async function createUsers(
  connection,
  names,
  passwordHash
) {

  const users = [];


  for (
    let i = 0;
    i < names.length;
    i++
  ) {

    const displayName =
      names[i];


    const username =
      slugify(
        displayName
      ) +
      '_' +
      String(
        i + 1
      ).padStart(
        3,
        '0'
      );


    const email =
      `${username}@demo.nobochitro.local`;


    // Safety check.
    // If the generated account already exists,
    // we STOP rather than touching it.

    const existing =
      await connection.execute(

        `SELECT UserID
         FROM AppUser
         WHERE Username = :username
            OR Email = :email`,

        {
          username,
          email
        }

      );


    if (
      existing.rows.length > 0
    ) {

      throw new Error(

        `User ${username} already exists. ` +
        `Stopping for safety. No existing user will be modified.`

      );

    }


    const random =
      seededRandom(
        hashString(
          `join-${i}`
        )
      );


    const tasteGroup =
      getTasteGroup(i);


    // PROFILE PICTURE
    const profilePictureURL =
      getRandomProfilePicture(
        username,
        i
      );


    const result =
      await connection.execute(

        `INSERT INTO AppUser (
          UserID,
          Username,
          Email,
          PasswordHash,
          DisplayName,
          JoinDate,
          Bio,
          ProfilePictureURL,
          CoverPictureURL,
          IsAdmin
        )
        VALUES (
          seq_appuser.NEXTVAL,
          :username,
          :email,
          :passwordHash,
          :displayName,
          :joinDate,
          :bio,
          :profilePictureURL,
          NULL,
          0
        )
        RETURNING UserID INTO :newId`,

        {

          username,

          email,

          passwordHash,

          displayName,

          joinDate:
            randomDate(
              random,
              365
            ),

          bio:
            `Movie fan who enjoys ` +
            `${tasteGroup.name.toLowerCase()} movies ` +
            `and discovering new films.`,

          profilePictureURL,

          newId: {

            dir:
              oracledb.BIND_OUT,

            type:
              oracledb.NUMBER

          }

        }

      );


    users.push({

      userId:
        Number(
          result.outBinds.newId[0]
        ),

      username,

      displayName

    });

  }


  return users;

}


// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log('');
  console.log('========================================');
  console.log('NOBOCHITRO DEMO DATA SEED');
  console.log('========================================');

  console.log(
    'Existing users WILL NOT be deleted.'
  );

  console.log(
    'Existing posts WILL NOT be deleted.'
  );

  console.log(
    'Existing reviews WILL NOT be deleted.'
  );

  console.log('');

  console.log(
    `Creating ${USER_COUNT} new users...`
  );

  console.log(
    `Creating ${USER_COUNT * MOVIES_PER_USER} reviews...`
  );

  console.log(
    `Creating ${USER_COUNT * MOVIES_PER_USER} posts...`
  );

  console.log('');


  await initPool();


  const connection =
    await getPool()
      .getConnection();


  try {

    // --------------------------------------------------------
    // LOAD MOVIES
    // --------------------------------------------------------

    const movies =
      await loadMovies(
        connection
      );


    console.log(
      `Found ${movies.length} movies.`
    );


    if (
      movies.length <
      MOVIES_PER_USER
    ) {

      throw new Error(
        `At least ${MOVIES_PER_USER} movies are required.`
      );

    }


    // --------------------------------------------------------
    // PASSWORD
    // --------------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        DEMO_PASSWORD,
        12
      );


    // --------------------------------------------------------
    // CREATE 100 USERS
    // --------------------------------------------------------

    const names =
      buildNames();


    const users =
      await createUsers(
        connection,
        names,
        passwordHash
      );


    console.log(
      `Created ${users.length} new users.`
    );


    // --------------------------------------------------------
    // CREATE REVIEWS AND POSTS
    // --------------------------------------------------------

    const reviews = [];
    const posts = [];


    for (
      let userIndex = 0;
      userIndex < users.length;
      userIndex++
    ) {

      const user =
        users[userIndex];


      const tasteGroup =
        getTasteGroup(
          userIndex
        );


      const selectedMovies =
        chooseMoviesForUser(
          movies,
          tasteGroup,
          userIndex
        );


      const random =
        seededRandom(
          hashString(
            `text-${userIndex}`
          )
        );


      for (
        const movie
        of selectedMovies
      ) {

        const rating =
          ratingForMovie(
            movie,
            tasteGroup,
            userIndex
          );


        // ----------------------------------------------------
        // REVIEW
        // ----------------------------------------------------

        reviews.push({

          userId:
            user.userId,

          movieId:
            movie.movieId,

          ratingValue:
            rating,

          reviewText:
            reviewTextForRating(
              rating,
              movie.title,
              random
            ),

          reviewDate:
            randomDate(
              random,
              120
            )

        });


        // ----------------------------------------------------
        // POST
        // ----------------------------------------------------

        posts.push({

          userId:
            user.userId,

          movieId:
            movie.movieId,

          postText:
            postTextForRating(
              rating,
              movie.title,
              random
            ),

          postDate:
            randomDate(
              random,
              120
            )

        });

      }

    }


    console.log(
      `Prepared ${reviews.length} reviews.`
    );

    console.log(
      `Prepared ${posts.length} posts.`
    );


    // --------------------------------------------------------
    // INSERT REVIEWS
    // --------------------------------------------------------

    const reviewResult =
      await connection.executeMany(

        `INSERT INTO Review (
          UserID,
          MovieID,
          RatingValue,
          ReviewText,
          ReviewDate
        )
        VALUES (
          :userId,
          :movieId,
          :ratingValue,
          :reviewText,
          :reviewDate
        )`,

        reviews,

        {

          autoCommit: false,

          bindDefs: {

            userId: {
              type:
                oracledb.NUMBER
            },

            movieId: {
              type:
                oracledb.NUMBER
            },

            ratingValue: {
              type:
                oracledb.NUMBER
            },

            reviewText: {
              type:
                oracledb.STRING,

              maxSize:
                1000
            },

            reviewDate: {
              type:
                oracledb.DATE
            }

          }

        }

      );


    console.log(
      `Inserted ${reviewResult.rowsAffected} reviews.`
    );


    // --------------------------------------------------------
    // INSERT POSTS
    // --------------------------------------------------------

    const postResult =
      await connection.executeMany(

        `INSERT INTO Post (
          PostID,
          UserID,
          MovieID,
          PostText,
          PostDate
        )
        VALUES (
          seq_post.NEXTVAL,
          :userId,
          :movieId,
          :postText,
          :postDate
        )`,

        posts,

        {

          autoCommit: false,

          bindDefs: {

            userId: {
              type:
                oracledb.NUMBER
            },

            movieId: {
              type:
                oracledb.NUMBER
            },

            postText: {
              type:
                oracledb.STRING,

              maxSize:
                1000
            },

            postDate: {
              type:
                oracledb.DATE
            }

          }

        }

      );


    console.log(
      `Inserted ${postResult.rowsAffected} posts.`
    );


    // --------------------------------------------------------
    // COMMIT EVERYTHING
    // --------------------------------------------------------

    await connection.commit();


    console.log('');
    console.log('========================================');
    console.log('SEED COMPLETE');
    console.log('========================================');

    console.log(
      `New users : ${users.length}`
    );

    console.log(
      `Reviews   : ${reviewResult.rowsAffected}`
    );

    console.log(
      `Posts     : ${postResult.rowsAffected}`
    );

    console.log('');

    console.log(
      `Password for all new users: ${DEMO_PASSWORD}`
    );

    console.log('');

    console.log(
      'Example accounts:'
    );


    users
      .slice(0, 10)
      .forEach(
        user => {

          console.log(
            `${user.username} / ${DEMO_PASSWORD} / UserID ${user.userId}`
          );

        }
      );


    console.log('');

    console.log(
      'Each generated user has a DiceBear profile avatar.'
    );

    console.log(
      'Taste groups are correlated so Taste Match has useful data.'
    );

    console.log('========================================');
    console.log('');

  }

  catch (error) {

    try {

      await connection.rollback();

    }
    catch (_) {}


    console.error('');
    console.error('========================================');
    console.error('SEED FAILED');
    console.error('========================================');

    console.error(
      error.message
    );

    console.error('');

    console.error(
      'Transaction rolled back.'
    );

    console.error(
      'Existing data was not intentionally deleted or updated.'
    );

    console.error('========================================');

    process.exitCode = 1;

  }

  finally {

    await connection.close();

    await closePool();

  }

}


// ============================================================
// RUN
// ============================================================

main();