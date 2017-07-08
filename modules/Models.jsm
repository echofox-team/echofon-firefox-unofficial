//
// Implementation of Echofon model objects
//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonModel"];

const SCHEMA_VERSION = 4;
const MAX_STATUSES = 10000;
const { classes: Cc, interfaces: Ci } = Components;

let escape = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML);

Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/EchofonDatabase.jsm");
Components.utils.import("resource://echofon/PhotoBackend.jsm");

//
// Convert *id_str to *id (snowflake)
//
function convertIdStr(obj)
{
  for (var key in obj) {
    if (typeof obj[key] == 'object') {
      convertIdStr(obj[key]);
    }
    else if (key.match(/id$/)) {
      if (obj[key + '_str']) {
        obj[key] = obj[key + '_str'];
      }
      else {
        obj[key] = obj[key].toString();
      }
    }
  }
}

const EchofonModel = {};

var gDefaultPath = null;
var gPlatformPath = null;

EchofonModel.init = function() {
  let didGetAddon = function(addon) {
    gDefaultPath = addon.getResourceURI("defaults");
    gPlatformPath = addon.getResourceURI("platform");
    EchofonPhotoBackend.defaultPath = gDefaultPath;

    if (EchofonUtils.pref().getBoolPref("login")) {
      EchofonUtils.notifyComponents("initSession");
    }
  };
  // For Firefox 4 and later
  var login = EchofonUtils.pref().getBoolPref("login");
  try {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    if (appInfo.name != "Echofon") {
      Components.utils.import("resource://gre/modules/AddonManager.jsm");
      AddonManager.getAddonByID("echofon-unofficial@echofox-team", didGetAddon);
    }
    else {
      if (login) {
        EchofonUtils.notifyComponents("initSession");
      }
    }
  }
  catch (e) {
    if (login) {
      EchofonUtils.notifyComponents("initSession");
    }
  }
};

EchofonModel.libraryPath = function() {
  return gPlatformPath;
};

EchofonModel.isInitialized = function() {
  var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
  if (appInfo.name == "Echofon") {
    return true;
  }
  else {
    try {
      Components.utils.import("resource://gre/modules/AddonManager.jsm");
      return !!gDefaultPath;
    }
    catch (e) {
      return true;
    }
  }
};

EchofonModel.DBM = {
  _db: {},

  db: function(recipient_id) {

    if (!recipient_id) {
      EchofonUtils.dumpStackTrace();
      return null;
    }
    if (!this._db[recipient_id]) {
      var db = new EchofonDatabase();
      db.openTweetCache(gDefaultPath, recipient_id);

      // check schema version
      var stmt = db.prepare("PRAGMA user_version");
      stmt.step();
      var version = stmt.getInt32(0);
      stmt.finalize();
      if (version != SCHEMA_VERSION) {
        db = this.updateSchema(recipient_id, db);
      }

      try {
        this.optimize(db);
      }
      catch (e) {
        // If optimization failed, clear database on the next launch
        Components.utils.reportError("Failed to optimize database: " + e.message);
        EchofonUtils.pref().setBoolPref("clearDB", true);
      }

      this._db[recipient_id] = db;
    }
    return this._db[recipient_id];
  },

  optimize: function(db) {
    var stmt = db.prepare("SELECT count (*) FROM statuses");
    stmt.step();
    var count = stmt.getInt32(0);
    stmt.finalize();
    if (count > MAX_STATUSES) {
      EchofonUtils.log("# of statuses is " + count + ": optimize database...");
      stmt = db.prepare("SELECT id FROM statuses ORDER BY id DESC LIMIT 1 OFFSET " + (MAX_STATUSES/2));
      stmt.step();
      var id = stmt.getString(0);
      stmt.finalize();

      db.exec("BEGIN;" +
              "DELETE FROM statuses WHERE id < " + id + ";" +
              "DELETE FROM home     WHERE id < " + id + ";" +
              "DELETE FROM mentions WHERE id < " + id + ";" +
              "COMMIT;VACUUM;");
    }
  },

  updateSchema: function(recipient_id, db) {
    db.syncClose();
    db = null;
    var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    file.append('echofon_' + recipient_id + '.sqlite');
    if (file.exists()) {
      file.remove(false);
    }
    var newDB = new EchofonDatabase();
    newDB.openTweetCache(gDefaultPath, recipient_id);
    return newDB;
  },

  _64bitadd: function(a, b) {
    for (var i in this._db) {
      var db = this._db[i];
      var stmt = db.prepare("SELECT ?1 + ?2");
      stmt.bindStringParameter(0, a);
      stmt.bindStringParameter(1, b);
      stmt.step();
      return stmt.getString(0);
    }
    return "0";
  },

  _64bitsub: function(a, b) {
    for (var i in this._db) {
      var db = this._db[i];
      var stmt = db.prepare("SELECT ?1 - ?2");
      stmt.bindStringParameter(0, a);
      stmt.bindStringParameter(1, b);
      stmt.step();
      return stmt.getString(0);
    }
    return "0";
  },

  calcSnowflakeId: function(id, minutes) {
    for (var i in this._db) {
      var db = this._db[i];
      var stmt = db.prepare("SELECT ((?1 >> 22) - (?2 * 60 * 1000)) << 22");
      stmt.bindStringParameter(0, id);
      stmt.bindStringParameter(1, minutes);
      stmt.step();
      return stmt.getString(0);
    }
    return id;
  },

  closeAll: function() {
    for (var i in this._db) {
      var db = this._db[i];
      db.close();
    }
    this._db = {};
  }
};

/////////////////////////////////////////////////////////////////////////
//
// User model
//

const USER_COLUMNS = [
  'id', 'name', 'screen_name', 'location', 'description', 'url',
  'followers_count', 'friends_count', 'favourites_count', 'statuses_count',
  'profile_image_url', 'protected', 'verified', 'geo_enabled', 'updated_at'
];

EchofonModel.User = function(json, recipient_id, stmt)
{
  this.recipient_id = recipient_id;
  if (recipient_id) {
    this.db = EchofonModel.DBM.db(recipient_id);
  }

  // Init from JSON
  if (json) {
    convertIdStr(json);
    for (var i in json) {
      this[i] = json[i];
    }
  }

  // Init from DB
  if (stmt) {
    for (let col of USER_COLUMNS) {
      this[col] = stmt.row[col];
    }
  }
};

EchofonModel.User.prototype = {
  insertIntoDB: function(force) {
    if (!force && this.updated_at) {
      if (!this.needToUpdate()) return;
    }
    var values = USER_COLUMNS.map(function(word) {return ":"+word} ).join(",");
    var stmt = this.db.prepare("REPLACE INTO users VALUES (" + values + ")");
    if (!this.updated_at) {
      this.updated_at = new Date().getTime();
    }
    for (let col of USER_COLUMNS) {
      stmt.params[col] = this[col];
    }
    stmt.executeAsync();
  },

  needToUpdate: function() {
    let stmt =this.db.prepare("SELECT updated_at < :time FROM users WHERE id = :id");
    stmt.params['id'] = this.id;
    stmt.params['time'] = this.updated_at;
    if (stmt.executeStep()) {
      return !!stmt.getInt32(0);
    }
    return true;
  },

  bind: function(params) {
    let bp = params.newBindingParams();
    for (let col of USER_COLUMNS) {
      bp.bindByName(col, this[col]);
    }
    params.addParams(bp);
  },

  bindToStatement: function(stmt) {
    for (let col of USER_COLUMNS) {
      stmt.params[col] = this[col];
    }
  },

  profileImage72: function() {
    return this.profile_image_url.replace(/(.+)_normal\.(png|gif|jpg|jpeg)$/, "$1_bigger.$2");
  },

  profileImageUrl128: function() {
    return this.profile_image_url.replace(/(.+)_normal\.(png|gif|jpg|jpeg)$/, "$1_reasonably_small.$2");
  },

  profileImageUrlFull: function() {
    return this.profile_image_url.replace(/(.+)_normal\.(png|gif|jpg|jpeg)$/, "$1.$2");
  },

  isFollowing: function() {
    var stmt = this.db.prepare("SELECT id FROM following WHERE id = ?");
    stmt.bindStringParameter(0, this.id);
    return !!stmt.executeStep();
  },

  toString: function() {
    return "User: " + this.screen_name + " - " + this.id;
  }
};

EchofonModel.User.statementForUpdate = function(db) {
  var values = USER_COLUMNS.map(function(word) {return ":"+word} ).join(",");
  return db.prepare("REPLACE INTO users VALUES (" + values + ")");
};

EchofonModel.User.initWithRow = function(row, db_uid, startIndex) {
  var user = new EchofonModel.User(null, db_uid);
  for (let col of USER_COLUMNS) {
    user[col] = row.getResultByIndex(startIndex++);
  }
  return user;
};

EchofonModel.User.findById = function(id, recipient_id) {
  let cols = USER_COLUMNS.join(",");
  let stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT " + cols + " FROM users WHERE id = ?");
  stmt.bindInt64Parameter( 0, id);

  if (stmt.executeStep()) {
    return new EchofonModel.User(null, recipient_id, stmt);
  }
  else {
    return null;
  }
};

EchofonModel.User.findByScreenName = function(name, recipient_id) {
  let cols = USER_COLUMNS.join(",");
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT " + cols +" FROM users WHERE screen_name = ?");
  stmt.bindStringParameter( 0, name);

  if (stmt.executeStep()) {
    return new EchofonModel.User(null, recipient_id, stmt);
  }
  else {
    return null;
  }
};

EchofonModel.User.isFollowing = function(user_id, dbuid) {
  var stmt =EchofonModel.DBM.db(dbuid).prepare("SELECT id FROM following WHERE id = ?");
  stmt.bindStringParameter(0, user_id);
  return !!stmt.executeStep();
};

EchofonModel.User.follow = function(user_id, dbuid) {
  var db =EchofonModel.DBM.db(dbuid);
  var stmt = db.prepare("REPLACE INTO following VALUES (?)");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

EchofonModel.User.unfollow = function(user_id, dbuid) {
  var db =EchofonModel.DBM.db(dbuid);
  var stmt = db.prepare("DELETE FROM following WHERE id = ?");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

EchofonModel.User.updateFollowing = function(db, friends) {
  var delete_stmt = db.prepare("DELETE FROM following");

  var stmts = [delete_stmt];

  for (var i in friends) {
    var uid = friends[i];
    var insert_stmt = db.prepare("INSERT INTO following VALUES (?)");
    insert_stmt.bindInt32Parameter(0, uid);
    stmts.push(insert_stmt);
  }
  db.executeAsync(stmts, stmts.length);
};

//
//
// Status model
//
const STATUS_COLUMNS = [
    'id', 'id_str', 'user_id', 'full_text', 'created_at', 'source', 'latitude', 'longitude',
    'in_reply_to_status_id', 'in_reply_to_screen_name',
    'retweeted_status_id', 'retweeter_user_id', 'retweeter_screen_name', 'retweeted_at',
    'favorited', 'place', 'entities'
];

EchofonModel.Status = function(json, type, recipient_id)
{
  convertIdStr(json);
  for (var i in json) {
    this[i] = json[i];
  }

  // Handle retweet
  if (json && json['retweeted_status']) {
    this.retweeted_status_id   = json.retweeted_status.id;
    this.retweeter_screen_name = json.user.screen_name;
    this.retweeter_user_id     = json.user.id;
    this.retweeted_at          = json.created_at;
    var keys = ['user', 'full_text', 'created_at', 'source', 'geo', 'in_reply_to_status_id', 'in_reply_to_user_id', 'in_reply_to_screen_name', 'entities'];
    for (var i in keys) {
      var key = keys[i];
      if (json['retweeted_status'][key]) {
        this[key] = json['retweeted_status'][key];
      }
    }
  }


  if (json) {
    if (this.user) {
      this.user.updated_at = new Date(this.created_at).getTime();
    }

    if (this.source && this.source.match(/(&lt;|&gt;)/)) {
      this.source = escape.unescape(this.source);
    }
    if (json.in_reply_to_status_id) {
      this.in_reply_to_status_id   = json.in_reply_to_status_id_str;
      this.in_reply_to_user_id     = json.in_reply_to_user_id_str;
    }

    if (type == 'search') {
      if (json.from_user) {
        this.user = new EchofonModel.User(null, recipient_id);
        this.user.screen_name = json.from_user;
        this.user.name = json.from_user_name;
        this.user.id = json.from_user_id;
        this.user.profile_image_url = json.profile_image_url;
      }
      if (json.in_reply_to_status_id) {
        this.in_reply_to_screen_name = json.to_user;
      }
      if (json.metadata) {
        this.metadata = json.metadata;
      }
    }
    else {
      this.user = new EchofonModel.User(this.user, recipient_id);
    }
  }

  this.type = type;
  this.has_mention = false;
  this.recipient_id = recipient_id;
  this.unread = false;
  this.db =EchofonModel.DBM.db(recipient_id);

  this.updateAttributes();
};

EchofonModel.Status.prototype = {
  insertIntoDB: function() {
    if (this.type == 'lists' || this.type == 'search') return true;

    let writer = new EchofonModel.StatusWriter(this.db, this.type);
    writer.addTweet(this);
    writer.executeAsync();
    return true;
  },

  bind: function(status_params, timeline_params) {
    let bp = status_params.newBindingParams();
    for (let col of STATUS_COLUMNS) {
      if (col == 'user_id') {
        bp.bindByName('user_id', this.user.id);
      }
      if (col == 'place' && this.place) {
        bp.bindByName(col, JSON.stringify(this.place));
      }
      else if (col == 'entities' && this.entities) {
        bp.bindByName(col, JSON.stringify(this.entities));
      }
      else if (this[col]) {
        bp.bindByName(col, this[col]);
      }
    }
    status_params.addParams(bp);

    if (timeline_params) {
      let bp1 = timeline_params.newBindingParams();
      bp1.bindByName('id', this.id);
      timeline_params.addParams(bp1);
    }
  },

  retweet: function(tweet) {
    this.retweeted_at = tweet.created_at;
    this.retweeter_screen_name = tweet.user.screen_name;
    this.retweeted_status_id = tweet.id_str;
    this.retweeter_user_id = tweet.user.id;

    var stmt = this.db.prepare("UPDATE statuses SET retweeted_at = ?, retweeter_screen_name = ?, retweeter_user_id = ?, retweeted_status_id = ? WHERE id = ?");

    stmt.bindInt32Parameter( 0, this.retweeted_at);
    stmt.bindStringParameter(1, this.retweeter_screen_name);
    stmt.bindInt32Parameter( 2, this.retweeter_user_id);
    stmt.bindStringParameter(3, this.retweeted_status_id);
    stmt.bindStringParameter(4, this.id);
    stmt.executeAsync();
  },

  undoRetweet: function() {
    this.retweeted_at = 0;
    this.retweeter_screen_name = "";
    this.retweeted_status_id = "";
    this.retweeter_user_id = 0;

    var stmt = this.db.prepare("UPDATE statuses SET retweeted_at = 0, retweeter_screen_name = '', retweeter_user_id = 0, retweeted_status_id = 0 WHERE id = ?");
    stmt.bindStringParameter(0, this.id);
    stmt.executeAsync();
  },

  updateAttributes: function() {
    // update reply, highlight, and the other attribute of this status
    //
    if (this.entities && this.entities.user_mentions) {
      for (var i in this.entities.user_mentions) {
        var m = this.entities.user_mentions[i];
        if (m.id == this.recipient_id) {
          this.has_mention = true;
          break;
        }
      }
    }
  }
};

EchofonModel.Status.statementForUpdate = function(db)
{
  var values = STATUS_COLUMNS.map(function(word) {return ":"+word} ).join(",");
  return db.prepare("REPLACE INTO statuses VALUES (" + values + ")");
};

EchofonModel.Status.statementForUpdateTimeline = function(db, type)
{
  if (type) {
    return db.prepare("REPLACE INTO " + type + " VALUES (:id)");
  }
  else {
    return null;
  }
};

EchofonModel.Status.initWithStatement = function(stmt, type, recipient_id)
{
  var status = new EchofonModel.Status(null, type, recipient_id);
  for (let col of STATUS_COLUMNS) {
    status[col] = stmt.row[col];
  }
  status.id = status.id_str;
  try {status.place    = JSON.parse(status.place) } catch (e) {}
  try {status.entities = JSON.parse(status.entities)} catch (e) {}

  status.user = EchofonModel.User.findById(status.user_id, recipient_id);
  status.updateAttributes();

  return status;
};

EchofonModel.Status.initWithRow = function(row, type, recipient_id)
{
  var status = new EchofonModel.Status(null, type, recipient_id);

  var index = 0;
  for (let col of STATUS_COLUMNS) {
    status[col] = row.getResultByIndex(index);
    ++index;
  }
  status.id = status.id_str;
  try {status.place    = JSON.parse(status.place) } catch (e) {}
  try {status.entities = JSON.parse(status.entities)} catch (e) {}

  status.user = EchofonModel.User.initWithRow(row, recipient_id, index);
  status.updateAttributes();

  return status;
};

EchofonModel.Status.exist = function(db_uid, type, status_id, retweeted_status_id) {
  var db = EchofonModel.DBM.db(db_uid);
  var stmt = db.prepare("SELECT id FROM " + type + " WHERE id = ?1");
  stmt.bindStringParameter(0, status_id);
  if (stmt.executeStep()) {
    return true;
  }

  if (retweeted_status_id) {
    var rtcheck = db.prepare("SELECT id FROM statuses WHERE id = ?1 OR retweeted_status_id = ?1");
    rtcheck.bindStringParameter(0, retweeted_status_id);
    return !!rtcheck.executeStep();
  }
  return false;
};

EchofonModel.Status.restoreAsync = function(recipient_id, type, count, callback)
{
  var sql = "SELECT statuses.*, users.* FROM statuses,users," + type + " WHERE statuses.id = " + type + ".id AND statuses.user_id = users.id ORDER BY statuses.id DESC LIMIT ?1";
  var stmt =EchofonModel.DBM.db(recipient_id).prepare(sql);

  if (!count) count = 20;
  stmt.bindInt32Parameter(0, count);
  stmt.executeAsync(callback);
};

EchofonModel.Status.loadOlderTweets = function(recipient_id, type, count, max_id) {
  var results = [];
  var sql = "SELECT * FROM statuses," + type + " WHERE statuses.id = " + type + ".id AND statuses.id < ?2 ORDER BY statuses.id DESC LIMIT ?1";
  var stmt =EchofonModel.DBM.db(recipient_id).prepare(sql);

  if (!count) count = 20;
  stmt.bindInt32Parameter(0, count);
  stmt.bindStringParameter(1, max_id);
  while (stmt.executeStep()) {
    results.push(new EchofonModel.Status.initWithStatement(stmt, type, recipient_id));
  }
  return results;
};

EchofonModel.Status.findById = function(status_id, recipient_id) {
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT * FROM statuses WHERE statuses.id = ?1");
  stmt.bindStringParameter(0, status_id);
  var status = null;
  try {
    if (stmt.executeStep()) {
      status = EchofonModel.Status.initWithStatement(stmt, 0, recipient_id);
    }
  }
  catch (e) {
   EchofonModel.DBM.db(recipient_id).logError("Failed to get tweet: " + e.message);
  }

  return status;
};

EchofonModel.Status.findByRetweetedStatusId = function(status_id, recipient_id) {
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT * FROM statuses WHERE statuses.retweeted_status_id = ?1");
  stmt.bindStringParameter(0, status_id);
  var status = null;
  try {
    if (stmt.executeStep()) {
      status = EchofonModel.Status.initWithStatement(stmt, 0, recipient_id);
    }
  }
  catch (e) {
   EchofonModel.DBM.db(recipient_id).logError("Failed to get tweet: " + e.message);
  }

  return status;
};

EchofonModel.Status.toggleFavorite = function(recipient_id, status_id, favorited) {
  var db =EchofonModel.DBM.db(recipient_id);
  var stmt = db.prepare("UPDATE statuses SET favorited = ? WHERE id = ?");
  stmt.bindInt32Parameter(0, favorited);
  stmt.bindStringParameter(1, status_id);
  stmt.executeAsync();
};

EchofonModel.Status.destroy = function(status_id, recipient_id) {
  var db =EchofonModel.DBM.db(recipient_id);
  var stmt0 = db.prepare("DELETE FROM statuses WHERE id = ?1");
  var stmt1 = db.prepare("DELETE FROM home     WHERE id = ?1");
  var stmt2 = db.prepare("DELETE FROM mentions WHERE id = ?1");
  stmt0.bindStringParameter(0, status_id);
  stmt1.bindStringParameter(0, status_id);
  stmt2.bindStringParameter(0, status_id);
  db.executeAsync([stmt0, stmt1, stmt2], 3);
};

EchofonModel.Status.getLatestId = function(recipient_id, type) {
  var db =EchofonModel.DBM.db(recipient_id);
  if (type != 'home' && type != 'mentions') return 0;

  var sql = "SELECT id FROM " + type + " ORDER BY id DESC LIMIT 1";
  var stmt = db.prepare(sql);

  try {
    if (stmt.executeStep()) {
      return stmt.getString(0);
    }
  }
  catch (e) {
    db.logError("Failed to select " + type + " id");
  }
  return 0;
};

EchofonModel.Status.blockUser = function(db_uid, user_id) {
  var db =EchofonModel.DBM.db(db_uid);
  var stmt = db.prepare("DELETE FROM statuses WHERE id = ?1");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

/////////////////////////////////////////////////////////////////////////
//
// Status updater
//
EchofonModel.StatusWriter = function(db, type)
{
  this.db = db;
  this.type = type;
  this.status_stmt     = EchofonModel.Status.statementForUpdate(db);
  this.status_params   = this.status_stmt.newBindingParamsArray();
  this.timeline_stmt   = EchofonModel.Status.statementForUpdateTimeline(db, type);
  if (this.timeline_stmt) {
    this.timeline_params = this.timeline_stmt.newBindingParamsArray();
  }

  this.checkUserTimestamp = false;
  this.length = 0;

  this.users = {};
};

EchofonModel.StatusWriter.prototype = {
  addTweet: function(tweet) {
    ++this.length;
    tweet.bind(this.status_params, this.timeline_params);
    if (this.users[tweet.user.id]) {
      if (this.users[tweet.user.id].updated_at < tweet.user.updated_at) {
        this.users[tweet.user.id] = tweet.user;
      }
    }
    else {
      this.users[tweet.user.id] = tweet.user;
    }
  },

  executeAsync: function() {
    var stmts = [];
    if (this.length) {
      this.status_stmt.bindParameters(this.status_params);
      stmts.push(this.status_stmt);
    }
    if (this.length && this.timeline_stmt) {
      this.timeline_stmt.bindParameters(this.timeline_params);
      stmts.push(this.timeline_stmt);
    }

    user_stmt   = EchofonModel.User.statementForUpdate(this.db);
    user_params = user_stmt.newBindingParamsArray();
    let skipped = 0;
    let num_users = 0;
    for (let uid in this.users) {
      let user = this.users[uid];
      if (this.checkUserTimestamp && !user.needToUpdate()) {
        skipped++;
        continue;
      }
      user.bind(user_params);
      num_users++;
    }
    if (num_users) {
      user_stmt.bindParameters(user_params);
      stmts.push(user_stmt);
    }

//    EchofonUtils.debug("Status writer - status: " + this.status_params.length + " / " + this.type + ": " + this.timeline_params.length + " / user: " + user_params.length + " / skipped: " + skipped);

    if (stmts.length) {
      this.db.executeAsync(stmts, stmts.length);
    }
  }
};

/////////////////////////////////////////////////////////////////////////
//
// Direct Message model
//
const MESSAGE_COLUMNS = ['id', 'id_str', 'sender_id', 'recipient_id', 'text', 'created_at', 'entities'];

EchofonModel.DirectMessage = function(json, db_uid)
{
  convertIdStr(json);
  for (var i in json) {
    this[i] = json[i];
  }
  this.user_id = db_uid;
  this.db =EchofonModel.DBM.db(db_uid);

  if (json) {
    this.sender    = new EchofonModel.User(this.sender, db_uid);
    this.recipient = new EchofonModel.User(this.recipient, db_uid);
    this.sender.updated_at    = new Date(this.created_at).getTime();
    this.recipient.updated_at = new Date(this.created_at).getTime();
    this.user = this.sender;

    this.type = "messages";
    this.isSent = (this.sender.id == db_uid);
  }
};

EchofonModel.DirectMessage.prototype = {
  bind: function(params) {
    let bp = params.newBindingParams();
    for (let col of MESSAGE_COLUMNS) {
      if (col == 'entities' && this.entities) {
        bp.bindByName(col, JSON.stringify(this.entities));
      }
      else if (this[col]) {
        bp.bindByName(col, this[col]);
      }
    }
    params.addParams(bp);
  },

  threadId: function() {
    return (this.recipient_id == this.user_id) ? this.sender_id : this.recipient_id;
  },

  needToUpdate: function() {
    var stmt = this.db.prepare("SELECT id < ?1 FROM threads WHERE recipient_id = ?2");
    stmt.bindStringParameter(0, this.id);
    stmt.bindInt32Parameter(1, this.threadId());

    if (stmt.executeStep()) {
      return !!stmt.getInt32(0);
    }
    return true;
  },

  toString: function() {
    return "DM: " + this.id + " " + this.sender.screen_name + " -> " + this.recipient.screen_name + " - " + this.text + " at " + new Date(this.created_at);
  }
};

EchofonModel.DirectMessage.exist = function(db_uid, id) {
  var db = EchofonModel.DBM.db(db_uid);
  var stmt = db.prepare("SELECT id FROM direct_messages WHERE id = ?1");
  stmt.bindStringParameter(0, id);
  try {
    return !!stmt.executeStep();
  }
  catch (e) {}
  return false;
};

EchofonModel.DirectMessage.statementForUpdate = function(db) {
  var values = MESSAGE_COLUMNS.map(function(word) {return ":"+word} ).join(",");
  return db.prepare("REPLACE INTO direct_messages VALUES (" + values + ")");
};

EchofonModel.DirectMessage.getConversationWith = function(db_user_id, recipient_id, count, offset)
{
  var results = [];

  if (!offset) offset = 0;
  if (!count) count = 20;
  if (recipient_id == db_user_id) {
    var sql = "SELECT * FROM direct_messages WHERE sender_id = ?1 AND recipient_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3";
  }
  else {
    var sql = "SELECT * FROM direct_messages WHERE sender_id = ?1 OR recipient_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3";
  }
  var stmt =EchofonModel.DBM.db(db_user_id).prepare(sql);

  stmt.bindInt64Parameter(0, recipient_id);
  stmt.bindInt32Parameter(1, count);
  stmt.bindInt32Parameter(2, offset);

  try {
    while (stmt.executeStep()) {
      var msg = new EchofonModel.DirectMessage(null, db_user_id);
      // from statuses table
      msg.id                      = stmt.getString(0);
      msg.id_str                  = stmt.getString(1);
      msg.sender_id               = stmt.getString(2);
      msg.recipient_id            = stmt.getString(3);
      msg.text                    = stmt.getString(4);
      msg.created_at              = new Date(stmt.getString(5)).getTime();
      try { msg.entities          = JSON.parse(stmt.getString(6))} catch (e) {};

      msg.id        = msg.id_str;
      msg.sender    = EchofonModel.User.findById(msg.sender_id, db_user_id);
      msg.recipient = EchofonModel.User.findById(msg.recipient_id, db_user_id);

      msg.user = msg.sender;
      msg.type = "messages";

      results.push(msg);
    }
  }
  catch (e) {
   EchofonModel.DBM.db(db_user_id).logError("Failed to restore direct messages from local cache");
  }
  stmt.finalize();

  results.reverse();

  return results;
};

EchofonModel.DirectMessage.destroy = function (message_id, db_user_id)
{
  var db =EchofonModel.DBM.db(db_user_id);
  var stmt = db.prepare("DELETE FROM direct_messages WHERE id = ?1");
  stmt.bindStringParameter(0, message_id);
  stmt.executeAsync();
};

EchofonModel.DirectMessage.getLatestId = function(recipient_id, type) {
  var stmt;
  var db =EchofonModel.DBM.db(recipient_id);
  if (type == "messages") {
    stmt = db.prepare("SELECT id FROM direct_messages WHERE recipient_id = ?1 AND sender_id != ?1 ORDER BY id DESC LIMIT 1");
    stmt.bindStringParameter(0, recipient_id);
  }
  else if (type == "sent") {
    stmt = db.prepare("SELECT id FROM direct_messages WHERE sender_id = ?1 AND recipient_id != ?1 ORDER BY id DESC LIMIT 1");
    stmt.bindStringParameter(0, recipient_id);
  }
  else {
    stmt = db.prepare("SELECT id FROM direct_messages ORDER BY id DESC LIMIT 1");
  }
  try {
    if (stmt.executeStep()) {
      return stmt.getString(0);
    }
  }
  catch (e) {
    db.logError("Failed to select " + type + " id");
  }
  return 0;
};

EchofonModel.DirectMessage.getEarliestId = function(recipient_id, type) {
  var stmt;
  var db =EchofonModel.DBM.db(recipient_id);
  if (type == "messages") {
      stmt = db.prepare("SELECT id-1 FROM direct_messages WHERE recipient_id = ?1 AND sender_id != ?1 ORDER BY id LIMIT 1");
      stmt.bindStringParameter(0, recipient_id);
  }
  else if (type == "sent") {
    stmt = db.prepare("SELECT id-1 FROM direct_messages WHERE sender_id = ?1 AND recipient_id != ?1 ORDER BY id LIMIT 1");
    stmt.bindStringParameter(0, recipient_id);
  }
  try {
    if (stmt.executeStep()) {
      return stmt.getString(0);
    }
  }
  catch (e) {
    db.logError("Failed to select " + type + " id");
  }
  return 0;
};

EchofonModel.DirectMessage.blockUser = function(db_uid, user_id) {
  var db =EchofonModel.DBM.db(db_uid);

  var stmt = db.prepare("DELETE FROM direct_messages WHERE sender_id = ?1 OR recipient_id = ?1");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

/////////////////////////////////////////////////////////////////////////
//
// DM updater
//
EchofonModel.DirectMessageWriter = function(db)
{
  this.db = db;
  this.dm_stmt     = EchofonModel.DirectMessage.statementForUpdate(db);
  this.dm_params   = this.dm_stmt.newBindingParamsArray();
  this.users = {};
  this.threads = {};
  this.length = 0;
};

EchofonModel.DirectMessageWriter.prototype = {
  addMessage: function(msg) {
    msg.bind(this.dm_params);
    ++this.length;
    this.addUser(msg.sender, msg);
    this.addUser(msg.recipient, msg);

    var uid = msg.threadId();
    if (this.threads[uid]) {
      if (this.threads[uid].updated_at < msg.updated_at) {
        this.thread[uid] = msg;
      }
    }
    else {
      this.threads[uid] = msg;
    }
  },

  addUser: function(user, fromMessage) {
    if (this.users[user.id]) {
      if (this.users[user.id].updated_at < fromMessage.updated_at) {
        this.users[user.id] = user;
      }
      
    }
    else {
      this.users[user.id] = user;
    }
    
  },

  executeAsync: function() {
    var stmts = [];
    if (this.length) {
      this.dm_stmt.bindParameters(this.dm_params);
      stmts.push(this.dm_stmt);
    }

    user_stmt   = EchofonModel.User.statementForUpdate(this.db);
    user_params = user_stmt.newBindingParamsArray();
    let num_users = 0;
    for (let uid in this.users) {
      let user = this.users[uid];
      if (user.needToUpdate()) {
        user.bind(user_params);
        num_users++;
      }
    }
    if (num_users) {
      user_stmt.bindParameters(user_params);
      stmts.push(user_stmt);
    }

    thread_stmt = EchofonModel.Thread.statementForUpdate(this.db);
    thread_params = thread_stmt.newBindingParamsArray();
    let num_thread = 0;
    for (let i in this.threads) {
      let msg = this.threads[i];
      if (msg.needToUpdate()) {
        EchofonModel.Thread.bind(thread_params, msg);
        num_thread++;
      }
    }
    if (num_thread) {
      thread_stmt.bindParameters(thread_params);
      stmts.push(thread_stmt);
    }

    EchofonUtils.debug("DM writer - msg: " + this.dm_params.length + " / user: " + user_params.length + " / thread: " + thread_params.length);

    if (stmts.length) {
      this.db.executeAsync(stmts, stmts.length);
    }
  }
};

/////////////////////////////////////////////////////////////////////////
//
// Threads
//
const THREAD_COLUMNS = ['recipient_id', 'id', 'id_str', 'text', 'updated_at'];

EchofonModel.Thread = function(user_id, message)
{
  this.unread = 0;
  this.user_id = user_id;
  this.type = 'thread';
  if (message) {
    this.recipient_id = message.threadId();
    this.id           = message.id;
    this.id_str       = message.id;
    this.text         = message.text;
    this.updated_at   = new Date(message.created_at).getTime();
    this.user         = (message.isSent) ? message.recipient : message.sender;
  }
};

EchofonModel.Thread.prototype = {
  toString:function() {
    return "Thread: " + this.id + " - " + this.user.screen_name + " - " + this.text + "( " + this.created_at + ")";
  }
};

EchofonModel.Thread.initWithStatement = function(db_uid, stmt)
{
  var t = new EchofonModel.Thread(db_uid);

  t.recipient_id  = stmt.getInt32(0);
  t.id            = stmt.getString(1);
  t.id_str        = stmt.getString(2);
  t.text          = stmt.getString(3);
  t.updated_at    = stmt.getInt32(4);

  t.id = t.id_str;
  t.user = EchofonModel.User.findById(t.recipient_id, db_uid);
  return t;
};

EchofonModel.Thread.initWithRow = function(row, db_uid)
{
  var t = new EchofonModel.Thread(db_uid);

  t.recipient_id  = row.getResultByIndex(0);
  t.id            = row.getResultByIndex(1);
  t.id_str        = row.getResultByIndex(2);
  t.text          = row.getResultByIndex(3);
  t.updated_at    = row.getResultByIndex(4);

  t.id = t.id_str;

  t.user = EchofonModel.User.initWithRow(row, db_uid, 5);
  return t;
};

EchofonModel.Thread.bind = function(params, msg)
{
  let bp = params.newBindingParams();
  bp.bindByName('recipient_id', msg.threadId());
  bp.bindByName('id', msg.id);
  bp.bindByName('id_str', msg.id);
  bp.bindByName('text', msg.text);
  bp.bindByName('updated_at', new Date(msg.created_at).getTime());
  params.addParams(bp);
};

EchofonModel.Thread.statementForUpdate = function(db)
{
  var cols = THREAD_COLUMNS.map(function(w) {return ":"+w}).join(",");
  return db.prepare("REPLACE INTO threads VALUES (" + cols + ")");
};

EchofonModel.Thread.findByRecipientId = function(db_uid, recipient_id)
{
  var stmt =EchofonModel.DBM.db(db_uid).prepare("SELECT * FROM threads WHERE recipient_id = ?1");
  stmt.bindInt32Parameter(0, recipient_id);

  var t = null;

  try {
    if (stmt.executeStep()) {
      t = EchofonModel.Thread.initWithStatement(db_uid, stmt);
    }
  }
  catch (e) {
   EchofonModel.DBM.db(db_uid).logError("Failed to get direct message threads from local cache");
  }
  return t;
};

EchofonModel.Thread.loadOlderThread = function(db_uid, count, max_id)
{
  var stmt = EchofonModel.DBM.db(db_uid).prepare("SELECT * FROM threads WHERE id < ?2 ORDER BY id DESC LIMIT ?1");
  if (!count) count = 20;
  stmt.bindInt32Parameter(0, count);
  stmt.bindStringParameter(1, max_id);


  var results = [];
  try {
    while (stmt.executeStep()) {
      results.push(EchofonModel.Thread.initWithStatement(db_uid, stmt));
    }
  }
  catch (e) {
   EchofonModel.DBM.db(db_uid).logError("Failed to restore direct message threads from local cache");
  }
  return results;
};

EchofonModel.Thread.restoreAsync = function(db_uid, count, callback)
{
  var stmt =EchofonModel.DBM.db(db_uid).prepare("SELECT threads.*,users.* FROM threads,users WHERE threads.recipient_id = users.id ORDER BY id DESC LIMIT ?1");
  if (!count) count = 20;
  stmt.bindInt32Parameter(0, count);
  stmt.executeAsync(callback);
};

EchofonModel.Thread.blockUser = function(db_uid, user_id) {
  var db =EchofonModel.DBM.db(db_uid);

  var stmt = db.prepare("DELETE FROM threads WHERE recipient_id = ?1");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

/////////////////////////////////////////////////////////////////////////
//
// Lists
//

const LIST_COLUMNS = ['id', 'name', 'full_name', 'slug', 'description', 'subscriber_count', 'member_count', 'mode', 'user_id'];

EchofonModel.List = function(json, recipient_id, stmt)
{
  convertIdStr(json);
  for (var i in json) {
    this[i] = json[i];
  }
  this.recipient_id = recipient_id;
  this.db =EchofonModel.DBM.db(recipient_id);
  if (this.user) {
    this.user = new EchofonModel.User(this.user, this.recipient_id);
  }

  if (stmt) {
    for (let col of LIST_COLUMNS) {
      this[col] = stmt.row[col];
    }
    this.user  = EchofonModel.User.findById(this.user_id, recipient_id);
  }
};

EchofonModel.List.prototype = {
  bind: function(params) {
    var bp = params.newBindingParams();
    for (let col of LIST_COLUMNS) {
      if (col == 'user_id') {
        bp.bindByName(col, this.user.id);
      }
      else {
        bp.bindByName(col, this[col]);
      }
    }
    params.addParams(bp);
  },

  insertIntoDB: function() {
    var insert_stmt = this.db.prepare("REPLACE INTO lists VALUES (" + LIST_COLUMNS.map(function(w){return ":" +w}).join(",") + ")");
    for (let col of LIST_COLUMNS) {
      insert_stmt.params[col] = this[col];
    }

    var user_stmt = EchofonModel.User.statementForUpdate(this.db);
    this.user.bindToStatement(user_stmt);

    db.executeAsync([insert_stmt, user_stmt], 2);
  },

  isOwnList: function() {
    return this.user.id == this.recipient_id;
  }
};

EchofonModel.List.findById = function(db_uid, list_id) {
  var stmt =EchofonModel.DBM.db(db_uid).prepare("SELECT * FROM lists WHERE lists.id = ?");
  stmt.bindInt32Parameter(0, list_id);

  var list = null;
  try {
    while (stmt.executeStep()) {
      list = new EchofonModel.List(null, db_uid, stmt);
    }
  }
  catch (e) {
    Components.utils.reportError("Failed to find list " + list_id + " from local cache");
  }
  return list;
};

EchofonModel.List.destroy = function(list_id, db_uid) {
  var stmt =EchofonModel.DBM.db(db_uid).prepare("DELETE FROM lists WHERE id = ?");
  stmt.bindInt32Parameter(0, list_id);
  stmt.executeAsync();
};

EchofonModel.List.loadAll = function(recipient_id) {
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT * FROM lists ORDER BY id DESC");

  var results = [];
  while (stmt.executeStep()) {
    results.push(new EchofonModel.List(null, recipient_id, stmt));
  }
  return results;
};

EchofonModel.List.deleteAndUpdateAll = function(recipient_id, lists) {
  if (lists.length == 0) return;
  var db = EchofonModel.DBM.db(recipient_id);
  var delete_stmt = db.prepare("DELETE FROM lists");
  var insert_stmt = db.prepare("REPLACE INTO lists VALUES (" + LIST_COLUMNS.map(function(w){return ":" +w}).join(",") + ")");
  var user_stmt   = EchofonModel.User.statementForUpdate(db);

  var params = insert_stmt.newBindingParamsArray();
  var user_params = user_stmt.newBindingParamsArray();
  for (let list of lists) {
    list.bind(params);
    list.user.bind(user_params);
  }
  insert_stmt.bindParameters(params);
  user_stmt.bindParameters(user_params);

  db.executeAsync([delete_stmt, insert_stmt, user_stmt], 3);
};

/////////////////////////////////////////////////////////////////////////
//
// Saved searches
//

EchofonModel.SavedSearch = function(json, recipient_id)
{
  convertIdStr(json);
  for (var i in json) {
    this[i] = json[i];
  }
  this.recipient_id = recipient_id;
  this.db =EchofonModel.DBM.db(recipient_id);
};

EchofonModel.SavedSearch.prototype = {
  insertIntoDB: function() {
    var stmt = this.db.prepare("INSERT INTO saved_searches VALUES (?,?)");
    stmt.bindInt32Parameter(0, this.id);
    stmt.bindStringParameter(1, this.query);
    stmt.executeAsync();
  }
};

EchofonModel.SavedSearch.isExist = function(query, recipient_id)
{
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT id FROM saved_searches WHERE query = ?");
  stmt.bindStringParameter(0, query);

  try {
    if (stmt.executeStep()) {
      return stmt.getInt32(0);
    }
  }
  catch (e) {}
  return 0;
};

EchofonModel.SavedSearch.loadAll = function(recipient_id) {
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("SELECT * FROM saved_searches ORDER BY id");

  var results = [];
  try {
    while (stmt.executeStep()) {
      var ss = new EchofonModel.SavedSearch(null, recipient_id);
      ss.id    = stmt.getInt32(0);
      ss.query = stmt.getString(1);
      results.push(ss);
    }
  }
  catch (e) {
    Components.utils.reportError("Failed to restore lists from local cache");
  }
  return results;
};

EchofonModel.SavedSearch.deleteAndUpdateAll = function(db_uid, ss) {
  var db = EchofonModel.DBM.db(db_uid);
  var stmt = db.prepare("DELETE FROM saved_searches");
  var ss_stmt = db.prepare("INSERT INTO saved_searches VALUES (:id, :query)");
  var ss_params = ss_stmt.newBindingParamsArray();

  for (let i in ss) {
    let s = ss[i];
    let bp = ss_params.newBindingParams();
    bp.bindByName('id', s.id);
    bp.bindByName('query', s.query);
    ss_params.addParams(bp);
  }

  ss_stmt.bindParameters(ss_params);
  db.executeAsync([stmt, ss_stmt], 2);
};

EchofonModel.SavedSearch.destroy = function(query_id, recipient_id) {
  var stmt =EchofonModel.DBM.db(recipient_id).prepare("DELETE FROM saved_searches WHERE id = ?");
  stmt.bindInt32Parameter(0, query_id);
  stmt.executeAsync();
};

/////////////////////////////////////////////////////////////////////////
//
// Block
//
EchofonModel.Blocking = function()
{
};

EchofonModel.Blocking.create = function(dbuid, user_id) {
  var stmt =EchofonModel.DBM.db(dbuid).prepare("INSERT INTO blocks VALUES (?)");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

EchofonModel.Blocking.update = function(dbuid, user_ids) {
  var db = EchofonModel.DBM.db(dbuid);
  var arr = [];
  arr.push(db.prepare("DELETE FROM blocks"));
  for (var user_id in user_ids) {
    var stmt = db.prepare("INSERT INTO blocks VALUES (?)");
    stmt.bindInt32Parameter(0, user_id);
    arr.push(stmt);
  }
  db.executeAsync(arr, arr.length);
};

EchofonModel.Blocking.destroy = function(dbuid, user_id) {
  var stmt =EchofonModel.DBM.db(dbuid).prepare("DELETE FROM blocks WHERE id = ?");
  stmt.bindInt32Parameter(0, user_id);
  stmt.executeAsync();
};

EchofonModel.Blocking.isBlocking = function(dbuid, user_id) {
  var stmt =EchofonModel.DBM.db(dbuid).prepare("SELECT id FROM blocks WHERE id = ?");
  stmt.bindInt32Parameter(0, user_id);
  return !!stmt.executeStep();
};


/////////////////////////////////////////////////////////////////////////
//
// No retweet
//

EchofonModel.NoRetweet = function() {};

EchofonModel.NoRetweet.update = function(recipient_id, user_ids) {
  var arr = [];
  var db= EchofonModel.DBM.db(recipient_id);
  arr.push(db.prepare("DELETE FROM no_retweet"));

  for (var i in user_ids) {
    var stmt = db.prepare("INSERT INTO no_retweet VALUES (?)");
    stmt.bindInt32Parameter(0, user_ids[i]);
    arr.push(stmt);
  }
  db.executeAsync(arr, arr.length);
};

EchofonModel.NoRetweet.create = function(dbuid, user_id) {
  try {
    var stmt =EchofonModel.DBM.db(dbuid).prepare("INSERT INTO no_retweet VALUES (?)");
    stmt.bindInt32Parameter(0, user_id);
    stmt.executeAsync();
  }
  catch (e) {}
};

EchofonModel.NoRetweet.destroy = function(dbuid, user_id) {
  try {
    var stmt =EchofonModel.DBM.db(dbuid).prepare("DELETE FROM no_retweet WHERE id = ?");
    stmt.bindInt32Parameter(0, user_id);
    stmt.executeAsync();
  }
  catch (e) {}
};

EchofonModel.NoRetweet.wantsRetweet = function(dbuid, user_id) {
  try {
    var stmt =EchofonModel.DBM.db(dbuid).prepare("SELECT id FROM no_retweet WHERE id = ?");
    stmt.bindInt32Parameter(0, user_id);
    return !stmt.executeStep();
  }
  catch (e) {
  }
  return true;
};
