//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonSync"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

const IDLE_TIME_INTERVAL = 10 * 60; // 10min
const SYNC_SERVER = "https://api.echofon.com/v3";
const DEFAULT_SYNC_INTERVAL = 3 * 60 * 1000;
const OAUTH_ECHO_PROVIDER = "https://api.twitter.com/1/account/verify_credentials.json";

Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/TwitterClient.jsm");
Components.utils.import("resource://echofon/Models.jsm");
Components.utils.import("resource://echofon/Account.jsm");
Components.utils.import("resource://echofon/EchofonSign.jsm");
Components.utils.import("resource://echofon/EchofonHttpRequest.jsm");

function EchofonSync()
{
  var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  obs.addObserver(this, "quit-application-granted", false);

  var idleService = Cc["@mozilla.org/widget/idleservice;1"].getService(Ci.nsIIdleService);
  idleService.addIdleObserver(this, IDLE_TIME_INTERVAL);

  try {
    this._sync = JSON.parse(EchofonUtils.pref().getCharPref("sync"));
  }
  catch (e) {
    EchofonUtils.pref().setCharPref("sync", "{}");
  }

  this._syncTimer = EchofonUtils.setDelayTask(DEFAULT_SYNC_INTERVAL, this, "updateSyncPoint", null, Ci.nsITimer.TYPE_REPEATING_SLACK);

  this._isIdle = false;
}

EchofonSync.prototype = {

  isSynced: function(user_id) {
    if (!this._sync[user_id] || !this._sync[user_id].key) {
      return null;
    }
    return this._sync[user_id].key;
  },

  getSyncData: function(user_id) {
    if (!this._sync[user_id]) {
      return null;
    }
    return this._sync[user_id];
  },

  disableSync: function(user_id) {
    delete this._sync[user_id].key;
    delete this._sync[user_id].sync;
    this.save();
  },

  startSync: function(account, callback) {
    if (!this._sync[account.user_id] || !this._sync[account.user_id].key) {
      return false;
    }

    this.registerUser(account.user_id, account.screen_name, {
      userDidRegister: function(success) {
        if (success) {
          EchofonSync.instance().getSyncPoint(account, callback);
        }
        else {
          callback();
        }
      }
    });
    return true;
  },

  registerUser: function(user_id, screen_name, callback) {
    var req = new EchofonHttpRequest();

    var target = this;
    req.onload    = function(p) {target.onLoadRegister(req,  user_id, callback)}
    req.onerror   = function(p) {target.onErrorRegister(req, user_id, callback);}

    req.setURL(SYNC_SERVER + "/device/register");
    var param = "twitter_id=" + user_id + "&screen_name=" + screen_name + '&client=Firefox&v=5';
    req.setPostData(param);

    var u = EchofonAccountManager.instance().get(user_id);
    var oauthecho = TwitterClient.buildOAuthHeader(u, "GET", OAUTH_ECHO_PROVIDER, {});
    req.setRequestHeader("X-Verify-Credentials-Authorization", "OAuth " + oauthecho);
    req.setRequestHeader("X-Auth-Service-Provider", OAUTH_ECHO_PROVIDER);

    var sig = this.addSignature(param);
    if (!sig) return null;
    req.setRequestHeader('X-Echofon-sig', sig);
    req.asyncOpen();

    return req;
  },

  onLoadRegister: function(req, user_id, callback) {
    if (Number(req.status) == 200) {
      var key = req.getResponseHeader("X-Echofon-Sess");
      if (this._sync[user_id]) {
        this._sync[user_id].key = key;
      }
      else {
        this._sync[user_id] = {key:key};
      }

      var resp = JSON.parse(req.responseText);
      this._sync[user_id].config = resp.config;
      this._sync[user_id].sync   = resp.sync_str;
      this._sync[user_id].mute   = resp.mute;

      this.save();
      callback['userDidRegister'](true);
    }
    else {
      callback['userDidRegister'](false);
    }
  },

  onErrorRegister: function(req, user_id, callback) {
    callback['userDidRegister'](false);
  },

  convertType: function(type) {
    if (type == 'home') return 'timeline';
    if (type == 'mentions') return 'replies';
    if (type == 'messages') return 'messages';
    return null;
  },

  markRead: function(id, user, type) {
    type = this.convertType(type);
    if (!type) return;

    if (!this._sync[user] || !this._sync[user]['sync']) {
      return;
    }

    var changed = false;
    try {
      if (!this._sync[user]['sync'][type] ||EchofonModel.DBM._64bitsub(id, this._sync[user]['sync'][type]) > 0) {
        changed = true;
        this._sync[user]['sync'][type] = id;
      }
      this.save();
    }
    catch (e) {}
    if (changed) {
      this.updateSyncPoint();
    }
  },

  isUnread: function(user, type, id) {
    if (!this._sync[user]) return true;
    type = this.convertType(type);
    if (!type) return true;

    try {
      if (EchofonModel.DBM._64bitsub(id, this._sync[user]['sync'][type]) <= 0) {
        return false;
      }
    }
    catch (e) {}

    return true;
  },

  isMuted: function(user_id, tweet, type) {
    if (type == 'mentions' || tweet.type == 'search') return false;
    if (!this._sync[user_id] || !this._sync[user_id].mute) return false;
    var mute = this._sync[user_id].mute;

    if (type != 'lists') {
      // check user
      for (var i in mute.user) {
        if (tweet.user && tweet.user.screen_name.toLowerCase() == mute.user[i].toLowerCase()) {
          return true;
        }
        if (tweet.retweeted_status && tweet.retweeted_status.user.screen_name.toLowerCase() == mute.user[i].toLowerCase()) {
          return true;
        }
      }
    }
    // check application
    if (mute.app && mute.app.length && tweet.source && tweet.source.match(/<a href\=\"([^\"]*)\"[^>]*>(.*)<\/a>/)) {
      var app = RegExp.$2;
      for (var i in mute.app) {
        if (app == mute.app[i]) {
          return true;
        }
      }
    }

    if (!mute.hashtag || mute.hashtag.length == 0 || !tweet.entities || tweet.entities.hashtags.length == 0) return false;

    // check hashtag
    for (var i in mute.hashtag) {
      for (var j in tweet.entities.hashtags) {
        if (('#' + tweet.entities.hashtags[j].text.toLowerCase()) == mute.hashtag[i].toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  },

  isMutedUser: function(user_id, screen_name) {
    if (!this._sync[user_id]) return false;
    if (!this._sync[user_id].mute) return false;
    var m = this._sync[user_id].mute.user;
    if (!m) return false;

    for (var i in m) {
      if (m[i] == screen_name) return true;
    }
    return false;
  },

  mute: function(user_id, value, type) {
    if (!this._sync[user_id]) {
      this._sync[user_id] = {};
    }
    if (!this._sync[user_id].mute) {
      this._sync[user_id].mute = {app:[], hashtag:[], user:[]};
    }

    var m = this._sync[user_id].mute[type];
    if (!m) {
      this._sync[user_id].mute[type] = [];
      m = this._sync[user_id].mute[type];
    }
    for (var i in m) {
      if (m[i] == value) return false;
    }
    m.push(value);

    this._sync[user_id].mute.updated_at = parseInt(Date.now() / 1000);
    this.save();

    if (!this._sync[user_id].key) return true;

    // send to sync server.
    var array = ['sessionid=' + this._sync[user_id].key];
    array.push('mute=' + encodeURIComponent(JSON.stringify(this._sync[user_id].mute)));

    var params = array.join('&');
    var req = this.postSyncData(user_id, '/sync/mute', params);
    return true;
  },

  unmute: function(user_id, value, type) {
    if (!this._sync[user_id]) return;
    if (!this._sync[user_id].mute) return;

    var m = this._sync[user_id].mute[type];

    var index = -1;

    for (var i in m) {
      if (m[i] == value) {
        index = i;
        break;
      }
    }
    if (index == -1) return;

    m.splice(i, 1);
    this._sync[user_id].mute.updated_at = parseInt(Date.now() / 1000);
    this.save();

    if (this._sync[user_id].key) {
      var array = ['sessionid=' + this._sync[user_id].key];
      array.push('mute=' + JSON.stringify(this._sync[user_id].mute));

      var params = array.join('&');
      var req = this.postSyncData(user_id, '/sync/mute', params);
    }
  },

  getSyncPoint: function(account, callback) {
    if (!this._sync[account.user_id] || !this._sync[account.user_id].key) {
      return false;
    }

    var param = 'sessionid=' + this._sync[account.user_id]['key'] + '&screen_name=' + account.screen_name;

    var req = new EchofonHttpRequest();

    var target = this;
    req.onload    = function() {target.onLoadSync(req, account.user_id, callback)}
    req.onerror   = function() {target.onErrorSync(req, account.user_id, callback);}

    req.setURL(SYNC_SERVER + '/sync/get?' + param);
    var sig = this.addSignature(param);
    if (!sig) return false;
    req.setRequestHeader('X-Echofon-sig', sig);
    req.asyncOpen();

    return true;
  },

  postSyncData: function(user, path, params, callback) {
    var req = new EchofonHttpRequest();

    var target = this;
    req.onload    = function() {target.onLoadSync(req, user, callback)}
    req.onerror   = function() {target.onErrorSync(req, user, callback);}

    req.setURL(SYNC_SERVER + path);
    req.setPostData(params);
    var sig = this.addSignature(params);
    if (!sig) return null;
    req.setRequestHeader('X-Echofon-sig', sig);
    req.asyncOpen();

    return req;
  },

  updateSyncPoint: function(callback) {
    var acct = EchofonAccountManager.instance().get();
    if (!acct) return false;
    var user = acct.user_id;

    if (!this._sync[user] || !this._sync[user].key) {
      return false;
    }

    if (this._isIdle) {
      return false;
    }

    var array = [];
    for (var k in this._sync[user]['sync']) {
      array.push(k + '=' + this._sync[user]['sync'][k]);
    }
    array.push('sessionid=' + this._sync[user].key);
    array.push('screen_name=' + acct.screen_name);
    array.push('twitter_id=' + acct.user_id);
    var params = array.join('&');

    var req = this.postSyncData(user, '/sync/save', params, callback);

    return true;
  },

  addSignature: function(data) {
    return EchofonSign.getSignatureForSyncServer(data);

    try {
      var com = Cc['@naan.net/twitterfox-sign;1'].getService(Ci.nsITwitterFoxSign);
      var sig = com.sign(data);
    }
    catch (e) {
      EchofonUtils.log("Can't load sync module. This platform is not supported.");
      return null;
    }
    var toHexString = function(charCode) { return ("0" + charCode.toString(16)).slice(-2); };
    return [toHexString(sig.charCodeAt(i)) for (i in sig)].join("");
  },

  onLoadSync: function(req, user, callback) {
    switch (Number(req.status)) {
    case 401:
      delete this._sync[user];
      var msg = "Authentication failed during syncing.";
      EchofonUtils.log(msg);
      EchofonUtils.notifyObservers("internalError", msg);
      break;

    case 205:
      delete this._sync[user].key;
      EchofonUtils.notifyObservers("alertMessage", "Can not sync (User key is not found). Sync is disabled.");
      break;

    case 200:
//      EchofonUtils.debug("Synced " + user + ": " + req.responseText);
      try {
        var resp = JSON.parse(req.responseText);
      }
      catch (e) {
        EchofonUtils.log('Failed to decode JSON data: ' + e.message);
        break;
      }
      try {
        sync = resp['sync_str'];
        EchofonUtils.debug("Synced " + user + " - " +sync['timeline'] + ' / ' + sync['replies'] + ' / ' + sync['messages'] + " | mute uesr:" + resp['mute']['user'].length + " app:" + resp['mute']['app'].length + " hashtags:" + resp['mute']['hashtag'].length);
      }catch (e) {}
      this._sync[user]['config'] = resp['config'];

      if (!this._sync[user]['sync']) {
        this._sync[user]['sync'] = {};
      }
      for (var type in resp['sync_str']) {
        if (!this._sync[user]['sync'][type] ||EchofonModel.DBM._64bitsub(resp['sync_str'][type], this._sync[user]['sync'][type]) > 0) {
          this._sync[user]['sync'][type] = resp['sync_str'][type];
        }
      }
      if (!this._sync[user].mute || !this._sync[user].mute.updated_at || (resp['mute'].updated_at > this._sync[user].mute.updated_at)) {
        this._sync[user].mute = resp['mute'];
      }

      EchofonUtils.notifyComponents("updateSyncData", {user_id:user, data:this._sync[user]});

      break;

    case 503:
      EchofonUtils.log("Echofon sync server is under maintenance.");
      break;

    default:
      var msg = "Unknown error occured during syncing. (" + req.status + ")";
      EchofonUtils.log(msg);
      if (Number(req.status) != 500) {
        EchofonUtils.notifyObservers("internalError", msg);
      }
      break;
    }
    this.save();

    if (callback) {
      callback(user);
    }
  },

  onErrorSync: function(req, user, callback) {
    EchofonUtils.log("Failed to sync. Network error.");

    if (callback) {
      callback();
    }
  },

  save: function() {
    if (this._sync) {
      var val = "{}";
      try {
        var val = JSON.stringify(this._sync);
      }
      catch (e) {}
      EchofonUtils.pref().setCharPref("sync", val);
    }
  },

  destroy: function() {
    var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    obs.removeBbserver(this, "quit-application-granted");

    var idleService = Cc["@mozilla.org/widget/idleservice;1"].getService(Ci.nsIIdleService);
    idleService.removeIdleObserver(this, IDLE_TIME_INTERVAL);

    this._syncTimer.cancel();
  },

  observe: function(subject, topic, data) {

    switch (topic) {
    case "idle":
      this._isIdle = true;
      break;

    case "back":
      this._isIdle = false;
      this.getSyncPoint(EchofonAccountManager.instance().get());
      break;

    case "quit-application-granted":
      this.destroy();
      break;

    }
  }
}

var gSync = null;

EchofonSync.instance = function() {
  if (gSync == null) {
    gSync = new EchofonSync();
  }
  return gSync;
}
