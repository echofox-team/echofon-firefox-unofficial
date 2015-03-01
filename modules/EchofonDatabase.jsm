//
// Implementation of Echofon database client
//
// Copyright (c) 2009 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonDatabase"];
const {classes:Cc, interfaces:Ci} = Components;

const SQLITE_DB_FILENAME = "echofon_2.0.sqlite";
const SQLITE_IMAGE_CACHE = "echofon_image_cache.sqlite";
const ECHOFON_UUID       = "twitternotifier@naan.net";

function EchofonDatabase()
{
  this.wrappedJSObject = false;
  this._conn = null;
}

EchofonDatabase.prototype = {

  toJSON: function() {
    return '';
  },

  openImageCache: function(URI) {
    if (URI) {
      this.templatePath = URI.QueryInterface(Components.interfaces.nsIFileURL).file;
    }
    var db_file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    db_file.append(SQLITE_IMAGE_CACHE);

    this.openDatabase(db_file, SQLITE_IMAGE_CACHE);
  },

  openTweetCache: function(URI, user_id) {
    if (URI) {
      this.templatePath = URI.QueryInterface(Components.interfaces.nsIFileURL).file;
    }
    this.recipient_id = user_id;
    var db_file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    db_file.append('echofon_' + user_id + '.sqlite');

    this.openDatabase(db_file, SQLITE_DB_FILENAME);
    if (!this._conn) return 0;

    return 1;
  },

  openDatabase: function(file, template) {
    Components.utils.import("resource://echofon/EchofonUtils.jsm");
    if (!file.exists()) {
      this.log("Database file " + file.leafName + " does not exist.");
      this.createDatabase(template, file);
      return;
    }

    try {
        this._conn = this.openConnection(file);
    }
    catch (e) {
      this.log("Failed to open database.(" + e.message + ") try re-create database file...");
      this.createDatabase(template, file);
    }
  },

  openConnection: function (file) {
    var storageService = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
    return storageService.openDatabase(file);
  },

  createDatabase: function(src_filename, db_file) {
    try {
      db_file.remove(false);
    }
    catch (e) {}

    var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    if (appInfo.name == "Echofon") {
      // For XUL Runner
      defaultFile = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("DefRt", Ci.nsIFile);
      this.templatePath = defaultFile;
    }
    else if (!this.templatePath) {
      // For Firefox 3.6
      try {
        var manager = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager);
        defaultFile = manager.getInstallLocation(ECHOFON_UUID).getItemLocation(ECHOFON_UUID);
        defaultFile.append("defaults");
        this.templatePath = defaultFile;
      }
      catch (e) {}
    }
    if (!this.templatePath) {
      Components.utils.reportError("Can't find template database path");
      return;
    }

    this.templatePath.append(src_filename);
    this.templatePath.copyTo(db_file.parent, db_file.leafName);
    this.log("Created database file: " + db_file.path);
    if (!db_file.exists()) {
      Components.utils.reportError("Failed to create database");
    }
    this._conn = this.openConnection(db_file);
    this.log("Database file is opened: " + db_file.leafName);
  },

  exec: function(sql) {
    try {
      this._conn.executeSimpleSQL(sql);
    }
    catch (e) {
      this.log("Failed to execute query: (" + sql + ") " + this._conn.lastErrorString);
    }
  },

  executeAsync: function(arr, length, callback) {
    this._conn.executeAsync(arr, length, callback);
  },

  prepare: function(sql) {
    var stmt;
    try {
      stmt = this._conn.createStatement(sql);
    }
    catch (e) {
      this.log("Failed to prepare statement: (" + sql + ") " + this._conn.lastErrorString);
      throw e;
    }
    return stmt;

  },

  close: function() {
    this._conn.asyncClose();
    this._conn = null;
  },

  syncClose: function() {
    this._conn.close();
    this._conn = null;
  },

  logError: function(msg) {

    if (this._conn.lastError >= 100) return;

    msg = msg + " (" + this._conn.lastErrorString + " (" + this._conn.lastError + ") / db " + this.recipient_id + ") ";
    this.log(msg);

    var param = {"state": "internalError", "data": msg + " Please restart Firefox."};
    Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService).notifyObservers(null, "echofon-status", JSON.stringify(param));

  },

  log: function(msg) {
    dump(msg + "\n");
  },

  lastError: function() {
    return this._conn.lastError;
  },

  lastErrorString: function() {
    return this._conn.lastErrorString;
  }
}
