-- 1. AppUser
create table appuser (
   userid            number(10) not null,
   username          varchar2(50) not null,
   email             varchar2(100) not null,
   passwordhash      varchar2(255) not null,
   displayname       varchar2(100),
   joindate          date not null,
   bio               clob,
   profilepictureurl varchar2(500)
);

-- 2. Movie
create table movie (
   movieid     number(10) not null,
   title       varchar2(200) not null,
   releaseyear number(4) not null,
   runtime     number(5),
   language    varchar2(50),
   country     varchar2(50),
   synopsis    clob,
   posterurl   varchar2(500),
   trailerurl  varchar2(500)
);
alter table Movie
add Box_Office_Collection number(15,2);

-- 3. Genre
create table genre (
   genreid   number(10) not null,
   genrename varchar2(50) not null
);

-- 4. MovieGenre (bridge: Movie <-> Genre)
create table moviegenre (
   movieid number(10) not null,
   genreid number(10) not null
);

-- 5. Person
create table person (
   personid    number(10) not null,
   fullname    varchar2(150) not null,
   dateofbirth date,
   bio         clob,
   photourl    varchar2(500)
);

-- 6. MovieCredit (associative: Movie <-> Person, role-carrying)
create table moviecredit (
   movieid       number(10) not null,
   personid      number(10) not null,
   roletype      varchar2(20) not null,
   charactername varchar2(150)
);

-- 7. Review (weak entity: AppUser <-> Movie)
create table review (
   userid      number(10) not null,
   movieid     number(10) not null,
   ratingvalue number(2) not null,
   reviewtext  clob,
   reviewdate  date not null
);

-- 8. JournalEntry (existence-dependent, surrogate PK — allows rewatches)
create table journalentry (
   journalid     number(10) not null,
   userid        number(10) not null,
   movieid       number(10) not null,
   watchdate     date,
   watchtime     varchar2(5),        -- Oracle has no native TIME type->careful pahim bhai
   watchlocation varchar2(150),
   watchedwith   varchar2(200),
   moodbefore    varchar2(50),
   moodafter     varchar2(50),
   rewatchnumber number(3),
   favoritescene clob,
   privacy       varchar2(10),
   journaltext   clob
);

-- 9. BucketList
create table bucketlist (
   listid      number(10) not null,
   userid      number(10) not null,
   title       varchar2(150) not null,
   description clob,
   visibility  varchar2(10),
   listtype    varchar2(30)
);

-- 10. BucketListItem (bridge: BucketList <-> Movie)
create table bucketlistitem (
   listid    number(10) not null,
   movieid   number(10) not null,
   dateadded date
);

-- 11. Post
create table post (
   postid   number(10) not null,
   userid   number(10) not null,
   movieid  number(10) not null,        --we assume that a post is always about a movie, but we can change this later if we want to allow posts about other things,careful pahim bhai        
   posttext clob not null,
   postdate date not null         -- Oracle DATE stores date+time to the second
);

-- 12. PostLike (bridge: AppUser <-> Post)
create table postlike (
   postid   number(10) not null,
   userid   number(10) not null,
   likedate date
);

-- 13. PostComment (weak entity: dependent on Post)
create table postcomment (
   commentid   number(10) not null,
   postid      number(10) not null,
   userid      number(10) not null,
   commenttext clob not null,
   commentdate date not null
);

-- 14. Challenge
create table challenge (
   challengeid   number(10) not null,
   title         varchar2(150) not null,
   description   clob,
   criteriatype  varchar2(30),
   criteriavalue varchar2(100),
   targetcount   number(5) not null,
   xpreward      number(6) not null,
   startdate     date,
   enddate       date
);

-- 15. UserChallengeProgress (bridge: AppUser <-> Challenge)
create table userchallengeprogress (
   userid          number(10) not null,
   challengeid     number(10) not null,
   currentprogress number(5) default 0,
   completed       number(1) default 0,
   completiondate  date
);

-- 16. Badge
create table badge (
   badgeid             number(10) not null,
   badgename           varchar2(100) not null,
   description         clob,
   iconurl             varchar2(500),
   criteriadescription clob
);

-- 17. UserBadge (bridge: AppUser <-> Badge)
create table userbadge (
   userid     number(10) not null,
   badgeid    number(10) not null,
   dateearned date not null
);
