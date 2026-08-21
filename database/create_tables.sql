-- 1. AppUser
CREATE TABLE AppUser (
    UserID              NUMBER(10)      NOT NULL,
    Username            VARCHAR2(50)    NOT NULL,
    Email               VARCHAR2(100)   NOT NULL,
    PasswordHash        VARCHAR2(255)   NOT NULL,
    DisplayName         VARCHAR2(100),
    JoinDate            DATE            NOT NULL,
    Bio                 CLOB,
    ProfilePictureURL   VARCHAR2(500)
);

-- 2. Movie
CREATE TABLE Movie (
    MovieID         NUMBER(10)      NOT NULL,
    Title           VARCHAR2(200)   NOT NULL,
    ReleaseYear     NUMBER(4)       NOT NULL,
    Runtime         NUMBER(5),
    Language        VARCHAR2(50),
    Country         VARCHAR2(50),
    Synopsis        CLOB,
    PosterURL       VARCHAR2(500),
    TrailerURL      VARCHAR2(500)
);

-- 3. Genre
CREATE TABLE Genre (
    GenreID     NUMBER(10)      NOT NULL,
    GenreName   VARCHAR2(50)    NOT NULL
);

-- 4. MovieGenre (bridge: Movie <-> Genre)
CREATE TABLE MovieGenre (
    MovieID     NUMBER(10)  NOT NULL,
    GenreID     NUMBER(10)  NOT NULL
);

-- 5. Person
CREATE TABLE Person (
    PersonID        NUMBER(10)      NOT NULL,
    FullName        VARCHAR2(150)   NOT NULL,
    DateOfBirth     DATE,
    Bio             CLOB,
    PhotoURL        VARCHAR2(500)
);

-- 6. MovieCredit (associative: Movie <-> Person, role-carrying)
CREATE TABLE MovieCredit (
    MovieID         NUMBER(10)      NOT NULL,
    PersonID        NUMBER(10)      NOT NULL,
    RoleType        VARCHAR2(20)    NOT NULL,
    CharacterName   VARCHAR2(150)
);

-- 7. Review (weak entity: AppUser <-> Movie)
CREATE TABLE Review (
    UserID          NUMBER(10)  NOT NULL,
    MovieID         NUMBER(10)  NOT NULL,
    RatingValue     NUMBER(2)   NOT NULL,
    ReviewText      CLOB,
    ReviewDate      DATE        NOT NULL
);

-- 8. JournalEntry (existence-dependent, surrogate PK — allows rewatches)
CREATE TABLE JournalEntry (
    JournalID       NUMBER(10)      NOT NULL,
    UserID          NUMBER(10)      NOT NULL,
    MovieID         NUMBER(10)      NOT NULL,
    WatchDate       DATE,
    WatchTime       VARCHAR2(5),        -- Oracle has no native TIME type->careful pahim bhai
    WatchLocation   VARCHAR2(150),
    WatchedWith     VARCHAR2(200),
    MoodBefore      VARCHAR2(50),
    MoodAfter       VARCHAR2(50),
    RewatchNumber   NUMBER(3),
    FavoriteScene   CLOB,
    Privacy         VARCHAR2(10),
    JournalText     CLOB
);

-- 9. BucketList
CREATE TABLE BucketList (
    ListID          NUMBER(10)      NOT NULL,
    UserID          NUMBER(10)      NOT NULL,
    Title           VARCHAR2(150)   NOT NULL,
    Description     CLOB,
    Visibility      VARCHAR2(10),
    ListType        VARCHAR2(30)
);

-- 10. BucketListItem (bridge: BucketList <-> Movie)
CREATE TABLE BucketListItem (
    ListID      NUMBER(10)  NOT NULL,
    MovieID     NUMBER(10)  NOT NULL,
    DateAdded   DATE
);

-- 11. Post
CREATE TABLE Post (
    PostID      NUMBER(10)  NOT NULL,
    UserID      NUMBER(10)  NOT NULL,
    MovieID     NUMBER(10)  NOT NULL,       --we assume that a post is always about a movie, but we can change this later if we want to allow posts about other things,careful pahim bhai        
    PostText    CLOB        NOT NULL,
    PostDate    DATE        NOT NULL         -- Oracle DATE stores date+time to the second
);

-- 12. PostLike (bridge: AppUser <-> Post)
CREATE TABLE PostLike (
    PostID      NUMBER(10)  NOT NULL,
    UserID      NUMBER(10)  NOT NULL,
    LikeDate    DATE
);

-- 13. PostComment (weak entity: dependent on Post)
CREATE TABLE PostComment (
    CommentID       NUMBER(10)  NOT NULL,
    PostID          NUMBER(10)  NOT NULL,
    UserID          NUMBER(10)  NOT NULL,
    CommentText     CLOB        NOT NULL,
    CommentDate     DATE        NOT NULL
);

-- 14. Challenge
CREATE TABLE Challenge (
    ChallengeID     NUMBER(10)      NOT NULL,
    Title           VARCHAR2(150)   NOT NULL,
    Description     CLOB,
    CriteriaType    VARCHAR2(30),
    CriteriaValue   VARCHAR2(100),
    TargetCount     NUMBER(5)       NOT NULL,
    XPReward        NUMBER(6)       NOT NULL,
    StartDate       DATE,
    EndDate         DATE
);

-- 15. UserChallengeProgress (bridge: AppUser <-> Challenge)
CREATE TABLE UserChallengeProgress (
    UserID              NUMBER(10)  NOT NULL,
    ChallengeID         NUMBER(10)  NOT NULL,
    CurrentProgress     NUMBER(5)   DEFAULT 0,
    Completed           NUMBER(1)   DEFAULT 0,
    CompletionDate      DATE
);

-- 16. Badge
CREATE TABLE Badge (
    BadgeID                 NUMBER(10)      NOT NULL,
    BadgeName               VARCHAR2(100)   NOT NULL,
    Description             CLOB,
    IconURL                 VARCHAR2(500),
    CriteriaDescription     CLOB
);

-- 17. UserBadge (bridge: AppUser <-> Badge)
CREATE TABLE UserBadge (
    UserID      NUMBER(10)  NOT NULL,
    BadgeID     NUMBER(10)  NOT NULL,
    DateEarned  DATE        NOT NULL
);