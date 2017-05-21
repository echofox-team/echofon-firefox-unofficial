CREATE TABLE home (
    'id'        INTEGER PRIMARY KEY
);
CREATE TABLE mentions (
    'id'        INTEGER PRIMARY KEY
);
CREATE TABLE following (
    'id'        INTEGER PRIMARY KEY
);
CREATE TABLE blocks (
    'id'        INTEGER PRIMARY KEY
);
CREATE TABLE no_retweet (
    'id'        INTEGER PRIMARY KEY
);
CREATE TABLE direct_messages (
    'id'                     INTEGER PRIMARY KEY,
    'id_str'                 TEXT,
    'sender_id'              INTEGER,
    'recipient_id'           INTEGER,
    'text'                   TEXT,
    'created_at'             INTEGER,
    'entities'               BLOB
);
CREATE INDEX direct_messages_sender_id on direct_messages(sender_id);
CREATE INDEX direct_messages_recipient_id on direct_messages(recipient_id);
CREATE TABLE threads (
    'recipient_id'      INTEGER PRIMARY KEY,
    'id'                INTEGER,
    'id_str'            TEXT,
    'text'              TEXT,
    'updated_at'        INTEGER
);
CREATE TABLE lists (
    'id'                INTEGER PRIMARY KEY,
    'name'              TEXT COLLATE NOCASE,
    'full_name'         TEXT COLLATE NOCASE,
    'slug'              TEXT COLLATE NOCASE,
    'description'       TEXT,
    'subscriber_count'  INTEGER,
    'member_count'      INTEGER,
    'mode'              TEXT,
    'user_id'           INTEGER
);
CREATE TABLE users (
    'id'                     INTEGER PRIMARY KEY,
    'name'                   TEXT COLLATE NOCASE,
    'screen_name'            TEXT COLLATE NOCASE,
    'location'               TEXT,
    'description'            TEXT,
    'url'                    TEXT,
    'followers_count'        INTEGER,
    'friends_count'          INTEGER,
    'favourites_count'       INTEGER,
    'statuses_count'         INTEGER,
    'profile_image_url'      TEXT,
    'protected'              INTEGER,
    'verified'               INTEGER,
    'geo_enabled'            INTEGER,
    'updated_at'             INTEGER
);
CREATE INDEX users_screen_name on users(screen_name COLLATE NOCASE);
CREATE TABLE saved_searches (
    'id'                     INTEGER PRIMARY KEY,
    'query'                  TEXT COLLATE NOCASE
);
CREATE TABLE statuses (
    'id'                          INTEGER PRIMARY KEY,
    'id_str'                      TEXT,
    'user_id'                     INTEGER,
    'full_text'                   TEXT,
    'created_at'                  INTEGER,
    'source'                      TEXT,
    'latitude'                    REAL,
    'longitude'                   REAL,
    'in_reply_to_status_id'       TEXT,
    'in_reply_to_screen_name'     TEXT,
    'retweeted_status_id'         TEXT,
    'retweeter_user_id'           INTEGER,
    'retweeter_screen_name'       TEXT,
    'retweeted_at'                INTEGER,
    'favorited'                   INTEGER,
    'place'                       TEXT,
    'entities'                    BLOB
);
CREATE INDEX statuses_in_reply_to_status_id on "statuses"(in_reply_to_status_id);
CREATE INDEX statuses_retweeted_status_id   on "statuses"(retweeted_status_id);
