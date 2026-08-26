alter table appuser add constraint pk_appuser primary key ( userid );
alter table movie add constraint pk_movie primary key ( movieid );
alter table genre add constraint pk_genre primary key ( genreid );
alter table moviegenre add constraint pk_moviegenre primary key ( movieid,
                                                                  genreid );
alter table person add constraint pk_person primary key ( personid );
alter table moviecredit
   add constraint pk_moviecredit primary key ( movieid,
                                               personid,
                                               roletype );
alter table review add constraint pk_review primary key ( userid,
                                                          movieid );
alter table journalentry add constraint pk_journalentry primary key ( journalid );
alter table bucketlist add constraint pk_bucketlist primary key ( listid );
alter table bucketlistitem add constraint pk_bucketlistitem primary key ( listid,
                                                                          movieid );
alter table post add constraint pk_post primary key ( postid );
alter table postlike add constraint pk_postlike primary key ( postid,
                                                              userid );
alter table postcomment add constraint pk_postcomment primary key ( commentid );
alter table challenge add constraint pk_challenge primary key ( challengeid );
alter table userchallengeprogress add constraint pk_userchallengeprogress primary key ( userid,
                                                                                        challengeid );
alter table badge add constraint pk_badge primary key ( badgeid );
alter table userbadge add constraint pk_userbadge primary key ( userid,
                                                                badgeid );

-- UNIQUE CONSTRAINTS
alter table appuser add constraint uq_appuser_username unique ( username );
alter table appuser add constraint uq_appuser_email unique ( email );
alter table genre add constraint uq_genre_genrename unique ( genrename );
alter table badge add constraint uq_badge_badgename unique ( badgename );

-- CHECK CONSTRAINTS
alter table review
   add constraint ck_review_ratingvalue check ( ratingvalue between 1 and 10 );

alter table moviecredit
   add constraint ck_moviecredit_roletype
      check ( roletype in ( 'Actor',
                            'Director',
                            'Writer' ) );

alter table journalentry
   add constraint ck_journalentry_privacy check ( privacy in ( 'Public',
                                                               'Private' ) );

alter table bucketlist
   add constraint ck_bucketlist_visibility check ( visibility in ( 'Public',
                                                                   'Private' ) );

alter table bucketlist
   add constraint ck_bucketlist_listtype
      check ( listtype in ( 'System-Watchlist',
                            'System-Favorites',
                            'Custom' ) );

alter table userchallengeprogress
   add constraint ck_ucp_completed check ( completed in ( 0,
                                                          1 ) );

-- FOREIGN KEYS
-- Bridge/weak-entity rows are given ON DELETE CASCADE, since
-- Post.MovieID is an optional tag, so it gets ON DELETE SET NULL.

-- MovieGenre -> Movie, Genre
alter table moviegenre
   add constraint fk_moviegenre_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete cascade;
alter table moviegenre
   add constraint fk_moviegenre_genre
      foreign key ( genreid )
         references genre ( genreid )
            on delete cascade;

-- MovieCredit -> Movie, Person
alter table moviecredit
   add constraint fk_moviecredit_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete cascade;
alter table moviecredit
   add constraint fk_moviecredit_person
      foreign key ( personid )
         references person ( personid )
            on delete cascade;

-- Review -> AppUser, Movie
alter table review
   add constraint fk_review_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;
alter table review
   add constraint fk_review_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete cascade;

-- JournalEntry -> AppUser, Movie
alter table journalentry
   add constraint fk_journalentry_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;
alter table journalentry
   add constraint fk_journalentry_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete cascade;

-- BucketList -> AppUser
alter table bucketlist
   add constraint fk_bucketlist_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;

-- BucketListItem -> BucketList, Movie
alter table bucketlistitem
   add constraint fk_bli_bucketlist
      foreign key ( listid )
         references bucketlist ( listid )
            on delete cascade;
alter table bucketlistitem
   add constraint fk_bli_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete cascade;

-- Post -> AppUser (mandatory), Movie (optional)
alter table post
   add constraint fk_post_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;
alter table post
   add constraint fk_post_movie
      foreign key ( movieid )
         references movie ( movieid )
            on delete set null;

-- PostLike -> Post, AppUser
alter table postlike
   add constraint fk_postlike_post
      foreign key ( postid )
         references post ( postid )
            on delete cascade;
alter table postlike
   add constraint fk_postlike_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;

-- PostComment -> Post, AppUser
alter table postcomment
   add constraint fk_postcomment_post
      foreign key ( postid )
         references post ( postid )
            on delete cascade;
alter table postcomment
   add constraint fk_postcomment_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;

-- UserChallengeProgress -> AppUser, Challenge
alter table userchallengeprogress
   add constraint fk_ucp_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;
alter table userchallengeprogress
   add constraint fk_ucp_challenge
      foreign key ( challengeid )
         references challenge ( challengeid )
            on delete cascade;

-- UserBadge -> AppUser, Badge
alter table userbadge
   add constraint fk_userbadge_appuser
      foreign key ( userid )
         references appuser ( userid )
            on delete cascade;
alter table userbadge
   add constraint fk_userbadge_badge
      foreign key ( badgeid )
         references badge ( badgeid )
            on delete cascade;
            