//
// Implementation of Echofon main component
//
// Copyright (c) 2009 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;
const AD_INTERVAL_TIME = 10 * 60 * 1000; // 10 min

//
// Echofon main component.
//
function Echofon() {
  this.wrappedJSObject = true;
  var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

  obs.addObserver(this, "quit-application", false);
  obs.addObserver(this, "quit-application-granted", false);
  obs.addObserver(this, "echofon-command", false);

  Components.utils.import("resource://echofon/Models.jsm");
  Components.utils.import("resource://echofon/Account.jsm");
  Components.utils.import("resource://echofon/EchofonSync.jsm");
  Components.utils.import("resource://echofon/EchofonUtils.jsm");
  Components.utils.import("resource://echofon/TwitterClient.jsm");
  Components.utils.import("resource://echofon/EchofonHttpRequest.jsm");
  Components.utils.import("resource://echofon/Timeline.jsm");
  //Components.utils.import("resource://echofon/EchofonGA.jsm");

  this._pref = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch("extensions.twitternotifier.");
}

// This is the implementation of your component.
Echofon.prototype = {
  _lastSync: 0,
  _places: {},
  _initialized: false,
  _trends: null,
  _trendsAvailable: null,
  _loaders: {},
  _retry: null,
  _hasLogin: false,

  init: function() {
    // This method will be called everytime firefox opens browser window.
    if (this._initialized) return;
    EchofonUtils.get_version();
    this.migrateV1toV2();
    this.migrateV2Next();
    if (this._pref.getBoolPref("clearDB")) {
      this.clearDatabase();
    }

    this.loadConfiguration();

    var user_id = this._pref.getCharPref('activeUserIdStr');
    if (!EchofonAccountManager.instance().get(user_id)) {
      this._pref.setCharPref('activeUserIdStr', '');
      this._pref.setBoolPref('login', false);
    }

    if (EchofonUtils.isXULRunner()) {
      this._pref.setBoolPref("login", EchofonAccountManager.instance().numAccounts() == 0 ? false : true);
    }

    var runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
    var app = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    EchofonUtils.debug("(" + app.name + " version " + app.version + " / " + runtime.OS + "_" + runtime.XPCOMABI + ")");

    EchofonModel.init();

    this._initialized = true;
  },

  initSession: function() {
    if (!EchofonModel.isInitialized()) return;

    var acct = EchofonAccountManager.instance().get();
    if (acct) {
      this.verifyCredentials(acct);
      this.checkFollowing(acct);

      this.verifyLicense();
    }
    if (!EchofonUtils.isXULRunner()) {
      EchofonUtils.notifyObservers("delayInitWindow");
    }
  },

  restoreSession: function() {
    if (this.timelineLoader) {
      var ret = {query:this.timelineLoader.query, list:this.timelineLoader.list};
      EchofonUtils.notifyObservers("restoreSession", ret);

      var unread = this.timelineLoader.timelines.getUnread();
      EchofonUtils.notifyObservers("updateUnreadState", unread);

      var unread = this.timelineLoader.timelines.getUnreadCount();
      EchofonUtils.notifyObservers("updateUnreadCount", unread);
    }
  },

  getAd: function(info) {
    this._pref.setBoolPref("licensed", true);
    EchofonUtils.notifyObservers("removeAds");
  },

  onLoadAd: function (r) {
    if (Number(r.status) == 200) {
      var ad = JSON.parse(r.responseText);
      this._ad = ad;
      this._lastAd = new Date();
      if (ad) {
        EchofonUtils.notifyObservers("adDidLoad", ad);
        return;
      }
    }
    EchofonUtils.notifyObservers("failedToLoadAd");
  },

  onErrorLoadAd: function () {
    EchofonUtils.notifyObservers("failedToLoadAd");
  },

  verifyLicense: function(param) {
    var email = this._pref.getCharPref("license_to");
    var key   = this._pref.getCharPref("license_key");
    if (email.length && key.length) {
      var callback = this;
      EchofonUtils.verifyLicense(email, key, callback);
    }
    else {
      this._pref.setBoolPref("licensed", false);
    }
  },

  onVerifyLicense: function(r) {
    var sts = parseInt(r.status);

    if (sts == 200) {
      this._pref.setBoolPref("licensed", true);
      EchofonUtils.notifyObservers("removeAds");
      return;
    }

    if (sts < 500) {
      this._pref.setBoolPref("licensed", false);
      var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
      resp = JSON.parse(r.responseText);
      prompt.alert(null, "Failed to verify your license", resp.error);
      var acct = EchofonAccountManager.instance().get();
      EchofonUtils.notifyObservers("addAds");
    }
  },

  removeAds: function(param) {
    this._pref.setCharPref("license_to", param.email);
    this._pref.setCharPref("license_key", param.key);
    this._pref.setBoolPref("licensed", true);
    EchofonUtils.notifyObservers("removeAds");
  },

  //
  // Verify credentials, check oauth token, re-authroze
  //
  verifyCredentials: function(acct) {
    var req = new TwitterClient(acct, this);
    req.get("account.verify_credentials", {});
  },

  startSession: function(account) {
    // Get sync data before get tweets from twitter...
    var echofon_component = this;
    if (!EchofonSync.instance().startSync(account, function() {echofon_component.loadTimeline(account)})) {
      this.loadTimeline(account);
    }
    this.getAccountSettings(account);
  },

  account_verify_credentials: function(user, req, context) {
    if (user) {
      this._retry = null;
      var u = new EchofonModel.User(user, context.user_id);
      u.insertIntoDB(true);
      EchofonUtils.notifyObservers("updateUser", u);
      this.startSession(EchofonAccountManager.instance().get(u.id));
      this._hasLogin = true;
    }
    else {
      if (Number(req.status) == 401) {
        this._retry = null;
        EchofonUtils.error("Authentication failed: " + req.status);
        EchofonUtils.notifyObservers("failedToAuth", {message:context._errorMessage, screen_name:context.screen_name});
      }
      else if (context._errorCode == 0) {
        this._retry = null;
        var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
        prompt.alert(null, "Echofon", "Can't login to Twitter. (" + context._errorMessage + ")");
        this.logout();
      }
      else {
        var delay = 5000;
        if (this._retry != null) {
          delay = this._retry.delay * 2;
          if (isNaN(delay)) delay = 5000;
          if (delay > 60000) delay = 60000;
          this._retry.cancel();
        }
        var obj = this;
        this._retry = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        this._retry.initWithCallback({notify: function() {
            var acct = EchofonAccountManager.instance().get();
            obj.verifyCredentials(acct);
          }
        }, delay, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
        EchofonUtils.log("Retry verify credential in " + this._retry.delay + " msec...");
      }
    }
  },

  createTimelineLoader: function(acct, callback) {
    if (this.timelineLoader == null) {
      if (this._loaders[acct.user_id]) {
        this.timelineLoader = this._loaders[acct.user_id];
      }
      else {
        this.timelineLoader = new TimelineLoader(acct);
        this._loaders[acct.user_id] = this.timelineLoader;
      }
      this.timelineLoader.init(callback);
    }
    else {
      callback();
    }
  },

  loadTimeline: function(acct) {
    var obj = this;
    this.createTimelineLoader(acct, function() {
      dump("Load Timeline callback\n");
      obj.timelineLoader.start();
    });
  },

  getTimeline: function(param) {
    var obj = this;
    this.createTimelineLoader(EchofonAccountManager.instance().get(param.user_id),
    function() {
      if (param.type == 'lists' && param.list) {
        obj.timelineLoader.timelines.getTimeline('lists').changeList(param.list.id);
      }

      // return only first 20 tweets or all unread tweets to improve performance
      var ret = {msgs:obj.timelineLoader.timelines.getRecentTweets(param.type),
                 type:param.type};

      EchofonUtils.notifyObservers("buildTimeline", ret);
    });
  },

  compaction: function() {
    if (this.timelineLoader) {
      this.timelineLoader.timelines.compaction();
    }
  },

  getListTimeline: function(param) {
    this.timelineLoader.getListTimeline(param.list);
  },

  getNextPage: function(param) {
    var ret = {};
    var max_id =EchofonModel.DBM._64bitadd(param.max_id, -1);

    ret.msgs = this.timelineLoader.timelines.getTimeline(param.type).loadMore(20, max_id);

    if (!ret.msgs) {
      if (param.type == "messages") {
        ret.msgs = EchofonModel.Thread.loadOlderThread(param.user_id, 20, max_id);
        this.timelineLoader.timelines.getTimeline('messages').appendTweets(ret.msgs);
      }
      else if (param.type != 'search') {
        ret.msgs = EchofonModel.Status.loadOlderTweets(param.user_id, param.type, 20, max_id);
        this.timelineLoader.timelines.getTimeline(param.type).appendTweets(ret.msgs);
      }
    }

    // load from web
    if (!ret.msgs || ret.msgs.length == 0) {
      if (param.type == 'lists') {
        this.timelineLoader.getListTimeline(param.list, max_id);
      }
      else if (param.type == 'search') {
        if (param.query) {
          this.timelineLoader.searchTweets(param.query, max_id);
        }
      }
      else if (param.type == 'messages') {
        this.timelineLoader.getOlderDMs();
      }
      else {
        this.timelineLoader.getTweets(param.type, max_id);
      }
    }

    ret.type = param.type;
    EchofonUtils.notifyObservers("receivedNextPage", ret);
  },

  getStatus: function(param) {
    var account = EchofonAccountManager.instance().get();
    var tc = new TwitterClient(account, this);
    tc.get("statuses.show." + param.status_id, null, "statuses_show");
  },

  statuses_show: function(resp, req, context) {
    var sts = new EchofonModel.Status(resp, null, context.user_id);
    sts.insertIntoDB();
    EchofonUtils.notifyObservers("statusDidGet", resp);
  },

  searchTweets: function(param) {
    this.timelineLoader.searchTweets(param.query);
  },

  clearSearch: function(param) {
    this.timelineLoader.clearSearch();
  },

  saveSearch: function(param) {
    var account = EchofonAccountManager.instance().get();
    var tc = new TwitterClient(account, this);
    tc.post("saved_searches.create", {query:param.query}, "saved_searches_create");
  },

  destroySavedSearch: function(param) {
    var account = EchofonAccountManager.instance().get();
    var tc = new TwitterClient(account, this);
    tc.ssId = param.id;
    tc.post("saved_searches.destroy." + param.id, {'id':param.id}, "saved_searches_destroy");
  },

  saved_searches_create: function(resp, req, context) {
    if (resp) {
      var ss = new EchofonModel.SavedSearch(resp, context.user_id);
      ss.insertIntoDB();
      EchofonUtils.notifyObservers("searchQueryDidSave", resp);
    }
  },

  saved_searches_destroy: function(resp, req, context) {
    if (resp || Number(req.status) == 404) {
      var ss = EchofonModel.SavedSearch.destroy(context.ssId, context.user_id);
      EchofonUtils.notifyObservers("searchQueryDidDestroy", resp);
    }
  },

  loadAllList: function() {
    this.timelineLoader.getLists();
  },

  getSavedAndTrends: function() {

    this.timelineLoader.getSavedSearches();

    var account = EchofonAccountManager.instance().get();
    if (!account.settings) {
      this.getAccountSettings(account, 'getLocalTrend');
      return;
    }

    if (this._trends) {
      var woeid = 1;
      var settings = JSON.parse(account.settings);
      if (settings.trend_location) {
        woeid = settings.trend_location[0].woeid;
      }
      if (this._trends.locations[0].woeid == woeid) {
        var diff = (Date.now() - new Date(this._trends.as_of).getTime());
        // if last trends is older than 5 minutes
        if (diff < 5 * 60 * 1000) {
          EchofonUtils.notifyObservers("updateTrends", this._trends);
          return;
        }
      }
    }
    this.getLocalTrend(account);
  },

  getAccountSettings: function(account, callback) {
      var tc = new TwitterClient(account, this);
      tc.callback = callback;
      tc.get("account.settings");
  },

  account_settings: function(resp, req, context) {
    if (resp) {
      resp.updated_at = new Date().getTime();
      var acct = EchofonAccountManager.instance().get(context.user_id);
      acct.setValue('settings', req.responseText);
      acct.save();
      if (context.callback) {
        this[context.callback](acct);
      }
    }
    else {
      if (context.callback) {
        this[context.callback](acct);
      }
    }
  },

  getLocalTrend: function(acct) {
    if (acct.settings) {
      var tc = new TwitterClient(acct, this);
      var woeid = 1;
      var settings = JSON.parse(acct.settings);
      if (settings.trend_location) {
        woeid = settings.trend_location[0].woeid;
      }
      tc.get("trends.place", {'id': woeid}, "trends");
    }
  },

  trends: function(resp, req, context) {
    if (resp) {
      this._trends = resp[0];
      EchofonUtils.notifyObservers("updateTrends", this._trends);
    }
  },

  getLocalTrendAvailability: function() {
    if (!this._trendsAvailable) {
      var tc = new TwitterClient(null, this);
      tc.get("trends.available");
    }
    else {
      EchofonUtils.notifyObservers("updateTrendsAvailable", this._trendsAvailable);
    }
  },

  trends_available: function(resp, req, context) {
    if (resp) {
      this._trendsAvailable = resp;
      EchofonUtils.notifyObservers("updateTrendsAvailable", this._trendsAvailable);
    }
  },

  refresh: function(val) {
    if (!this._hasLogin) {
      if (this._retry) {
        this._retry.cancel();
        this._retry = null;
      }
      this.initSession();
      return;
    }
    var target = this;
    if (!EchofonSync.instance().updateSyncPoint(function() { target.timelineLoader.refreshTimeline(true); target.timelineLoader.refreshList()})) {
      this.timelineLoader.refreshTimeline(true);
      this.timelineLoader.refreshList();
    }
  },

  markRead: function(obj) {
    var type = obj.type;
    var uid  = obj.user_id;
    if (uid == 0) return;

    try {
      var latestId = 0;
      if (type == 'messages') {
        latestId = EchofonModel.DirectMessage.getLatestId(uid);
      }
      else {
        latestId = EchofonModel.Status.getLatestId(uid, type);
      }
      if (latestId) {
        EchofonSync.instance().markRead(latestId, uid, type);
      }
    }
    catch (e) {}

    if (this.timelineLoader) {
      this.timelineLoader.timelines.getTimeline(type).markRead();
    }
  },

  markReadThread: function(obj) {
    this.timelineLoader.timelines.getTimeline('messages').markReadThread(obj.id);
  },

  markAllRead: function() {
    var acct = EchofonAccountManager.instance().get();
    if (acct) {
      var types = ['home', 'mentions', 'messages'];
      for (var i in types) {
        this.markRead({type:types[i], user_id:acct.user_id});
      }
    }
  },

  updateSyncData: function(data) {
    if (this.timelineLoader) {
      this.timelineLoader.timelines.updateSyncData(data);
      EchofonUtils.notifyObservers("updateSyncData", data);
    }
  },

  sendMessage: function(msg) {
    if (msg.images.length) {
      this.uploadPhoto(msg);
      return;
    }

    var re = /^d\s+(\w+)\s+(.*)/;
    var arr = re.exec(msg.status);

    if (arr && arr.length == 3) {
      this.post("direct_messages.new", {user: arr[1], text: arr[2], include_entities:'true'}, msg);
      //EchofonGA.instance().trackEvent("post", "direct_message");
    }
    else if (msg.isDM) {
      this.post("direct_messages.new", {user: msg.user, text: msg.status, include_entities:'true'}, msg);
      //EchofonGA.instance().trackEvent("post", "direct_message");
    }
    else {
      var status = {status:msg.status};
      if (msg.inReplyTo) {
        status["in_reply_to_status_id"] = msg.inReplyTo;
        //EchofonGA.instance().trackEvent("post", "mention");
      }
      else {
        //EchofonGA.instance().trackEvent("post", "status");
      }
      if (msg.place_id) {
        status["place_id"] = msg.place_id;
      }
      status["include_entities"] = 'true';
      status["wrap_links"] = 'true';
      this.post("statuses.update", status, msg);
    }
  },

  uploadPhoto: function(msg) {
    var account = EchofonAccountManager.instance().get();
    Cu.import("resource://echofon/PlixiClient.jsm");
    var pc = new PlixiClient(account, this, msg);
    pc.upload(msg.images[0], msg.status)
    //EchofonGA.instance().trackEvent("post", "photo");
  },

  imageUploadDidFinish: function(context, path, url) {
    for (var i in context.images) {
      if (path == context.images[i]) {
        context.status += " " + url;
        context.images.splice(i, 1);
        break;
      }
    }
    this.sendMessage(context);
  },

  setFavorite: function(msg) {
    var acct = EchofonAccountManager.instance().get();

    this._req = new TwitterClient(acct, this);
    this._req.message_id = msg.id;
    this._req.post("favorites." + msg.method, {'id': msg.id}, "favorites_" + msg.method);
  },

  retweet: function(msg) {
    var account = EchofonAccountManager.instance().get();
    var req = new TwitterClient(account, this);
    req.post("statuses.retweet." + msg.id, {'trim_user': true}, "statuses_retweet");
        //EchofonGA.instance().trackEvent("post", "retweet");
  },

  statuses_retweet: function (tweet, req, context) {
    if (tweet) {
      var orig = EchofonModel.Status.findById(tweet.retweeted_status.id_str, context.user_id);
      if (!orig) {
        orig = EchofonModel.Status.findByRetweetedStatusId(tweet.retweeted_status.id_str, context.user_id);
      }
      if (!orig) {
        orig = new EchofonModel.Status(tweet.retweeted_status, null, context.user_id);
      }
      orig.retweet(tweet);
      this.timelineLoader.timelines.retweet(tweet.retweeted_status.id_str, tweet, false);
      EchofonUtils.notifyObservers("retweeted", orig);
    }
    else {
      if (Number(req.status) == 403) {
        Cu.reportError("Failed to retweet: " + req.status);
        EchofonUtils.notifyObservers("failedToRetweet", {text:"You've already retweeted"});
      }
      else {
        Cu.reportError("Failed to retweet: " + req.status);
        EchofonUtils.notifyObservers("failedToRetweet", {text:req.status});
      }
    }
  },

  undoRetweet: function(msg) {
    var account = EchofonAccountManager.instance().get();
    var req = new TwitterClient(account, this);
    req.post("statuses.destroy." + msg.id, {'trim_user': true}, "statuses_undo_retweet");
  },

  statuses_undo_retweet: function(tweet, req, context) {
    if (tweet) {
      var orig = EchofonModel.Status.findById(tweet.retweeted_status.id_str, context.user_id);
      if (orig) {
        orig.undoRetweet();
      }
      this.timelineLoader.timelines.retweet(orig.id, tweet, true);
      EchofonUtils.notifyObservers("undoRetweet", orig);
    }
    else {
      if (Number(req.status) == 403) {
        Cu.reportError("Failed to retweet: " + req.status);
        EchofonUtils.notifyObservers("failedToRetweet", {text:"You've already retweeted"});
      }
      else {
        Cu.reportError("Failed to retweet: " + req.status);
        EchofonUtils.notifyObservers("failedToRetweet", {text:req.status});
      }
    }
  },

  //
  // delete tweet / messages
  //
  deleteTweet: function(obj) {
    this.post("statuses.destroy." + obj.id, {'trim_user': true}, "statuses_destroy");
  },

  statuses_destroy: function(tweet, req, context) {
    var tweet_id = 0;
    var user_id;
    if (tweet) {
      tweet_id = tweet.id_str;
    }
    else if (Number(req.status) == 404) {
      EchofonUtils.log("Not found the message on server, but delete from local cache anyway");
      tweet_id = context.param.id;
    }
    if (tweet_id) {
      EchofonUtils.notifyObservers("tweetDidDelete", {id:tweet_id});
      EchofonModel.Status.destroy(tweet_id, context.user_id);
      this.timelineLoader.timelines.deleteTweet(tweet_id);
    }
  },

  deleteMessage: function(obj) {
    this.post("direct_messages.destroy", {id:obj.id});
  },

  direct_messages_destroy: function(obj, req, context) {
    var msg_id = 0;
    if (obj) {
      msg_id = obj.id_str;
    }
    else if (Number(req.status) == 404) {
      msg_id = context.param.id;
      EchofonUtils.log("Not found the message on server, but delete from local cache anyway");
    }
    if (msg_id) {
      EchofonUtils.notifyObservers("messageDidDelete", {id:obj.id_str});
      EchofonModel.DirectMessage.destroy(msg_id, context.user_id);
    }
    else {
      EchofonUtils.log("Failed to delete a direct message");
    }
  },

  //
  // Block / Report spam
  //

  blockUser: function(param) {
    if (param.type == "Block") {
      this.post("blocks.create", {user_id:param.user_id})
    }
    else {
      this.post("users.report_spam", {user_id:param.user_id});
    }
  },

  unblockUser: function(param) {
      this.post("blocks.destroy", {user_id:param.user_id})
  },

  removeBlockedUser: function(user_id, db_uid) {
    EchofonModel.Status.blockUser(db_uid, user_id);
    EchofonModel.DirectMessage.blockUser(db_uid, user_id);
    EchofonModel.Thread.blockUser(db_uid, user_id);
    this.timelineLoader.timelines.blockUser(user_id);
  },

  blocks_create: function(obj, req, context) {
    if (obj || Number(req.status) == 502) {
      this.removeBlockedUser(context.param.user_id, context.user_id);
      EchofonUtils.notifyObservers("didBlockUser", {id:context.param.user_id});
    }
    else {
      this.alertMessage("Failed to block user: " + context._errorMessage);
    }
  },

  blocks_destroy: function(obj, req, context) {
    EchofonUtils.notifyObservers("didUnblockUser", {id:obj.id});
  },

  report_spam: function(obj, req, context) {
    if (obj || Number(req.status) == 502) {
      this.removeBlockedUser(obj, context.user_id);
      EchofonUtils.notifyObservers("didReportSpam", {id:obj.id});
    }
    else {
      this.alertMessage("Failed to report spam: " + context._errorMessage);
    }
  },

  //
  // Geo location
  //
  getCurrentLocation: function() {
    var target = this;
    var geo = Components.classes["@mozilla.org/geolocation;1"].getService(Components.interfaces.nsIDOMGeoGeolocation);
    geo.getCurrentPosition(
      function(location) {
        target._location = location;
        target.getPlaces();
      },
      function (error) {
        EchofonUtils.dumpall(error);
        EchofonUtils.notifyObservers("didGetPlaces", {error:"Failed to get location: code " + error.code});
      },
      {enableHighAccuracy:false, timeout:15*1000});
  },

  getPlaces: function() {
    if (this._location) {
      if (Date.now() - this._location.timestamp > 15 * 60 * 1000) {
        this.getCurrentLocation();
        return;
      }

      var c = this._location.coords.latitude + "," + this._location.coords.longitude;
      if (this._places[c]) {
        EchofonUtils.notifyObservers("didGetPlaces", this._places[c]);
      }
      else {
          var req = new TwitterClient(null, this);
          req.get("geo.search", {lat:this._location.coords.latitude, long:this._location.coords.longitude, accuracy:this._location.coords.accuracy + "m", granularity:"poi"});
      }
    }
    else {
      this.getCurrentLocation();
    }
  },

  geo_search: function(obj, req, context) {
    if (obj) {
      var c = this._location.coords.latitude + "," + this._location.coords.longitude;
      this._places[c] = obj;
      EchofonUtils.notifyObservers("didGetPlaces", obj);
    }
    else {
      EchofonUtils.notifyObservers("didGetPlaces", {error:"Failed to get places: " + context._errorMessage});
    }
  },

  signIn: function() {
    EchofonUtils.notifyObservers("signInDidSuccess");
  },

  changeAccount: function(obj) {
    var user_id = obj.user_id;
    var account = EchofonAccountManager.instance().get(user_id);

    // mark all read then, sync unread
    try {
      this.markAllRead();
    }
    catch (e) {}
    EchofonSync.instance().updateSyncPoint();

    // reset session
    this.reset();

    this._pref.setCharPref("activeUserIdStr", account.user_id);
    this.initSession();

    var user = EchofonModel.User.findById(account.user_id, account.user_id);
    EchofonUtils.notifyObservers("accountChanged", user);
  },

  removeAccount: function(param) {
    if (this.timelineLoader && this.timelineLoader.token.user_id == param.user_id) {
      this.logout();
    }
    EchofonAccountManager.instance().remove(param.user_id);
  },

  reset: function() {
    if (this._req) {
      this._req.abort();
    }
    if (this.timelineLoader) {
      this.timelineLoader.stop();
      this.timelineLoader = null;
    }
    this._trend = null;
    this._hasLogin = false;
  },

  logout: function() {
    this._hasLogin = false;
    try {
      this.markAllRead();
      this.reset();
    }
    catch (e) {}
    if (!EchofonUtils.isXULRunner()) {
      this._pref.setCharPref("activeUserIdStr", '');
      this._pref.setBoolPref("login", false);
    }
    EchofonUtils.notifyObservers("logout");
  },

  //
  // Private methods.
  //
  get: function(method, params, context) {
    var account = EchofonAccountManager.instance().get();
    this._req = new TwitterClient(account, this);
    if (context) this._req.context = context;
    this._req.get(method, params);
  },

  post: function(method, params, context) {
    var account = EchofonAccountManager.instance().get();
    this._req = new TwitterClient(account, this);
    if (context) this._req.context = context;
    this._req.post(method, params);
  },

  destroy: function(e) {
    if (this._req) {
      this._req.abort();
    }
    this.timelineLoader.stop();

    var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    obs.removeObserver(this, "quit-application-granted");
    obs.removeObserver(this, "echofon-command");

    EchofonModel.DBM.closeAll();
  },

  // Check following of @echofon
  //
  checkFollowing: function(acct) {
    var checkFollow = this._pref.getIntPref("checkFollow");
    if (checkFollow == 0) {
      //EchofonGA.instance().trackEvent("app", "new user");
    }
    if (checkFollow == 2) {
      this.get("friendships.show", {"source_screen_name":acct.screen_name, "target_screen_name":"echofon"});
    }
    checkFollow++;
    this._pref.setIntPref("checkFollow", checkFollow);
  },

  followEchofon: function(user) {
    this.post("friendships.create", {screen_name:"echofon"})
  },

  friendships_show: function(resp, req, context) {
    if (!resp) {
      EchofonUtils.notifyObservers("askToFollowEchofon");
    }
  },

  //
  // TwitterAPI callbacks.
  //
  direct_messages_sent: function(resp, req, context) {
    if (resp) {
      this.retrieveTimeline(context, resp, "messages");
    }
    this.updateTimeline(context.screen_name);
  },

  toggleFavorite: function(user_id, status_id, favorited) {
    this.timelineLoader.timelines.toggleFavorite(status_id, favorited);
    EchofonUtils.notifyObservers("updateFavorite", {id: status_id, state:favorited});
  },

  favorites_destroy: function(obj, req, context) {
    if (obj) {
      this.toggleFavorite(context.user_id, obj.id_str, false);
    }
    else if (Number(req.status) == 403) {
      this.toggleFavorite(context.user_id, context.message_id, false);
    }
    else {
      EchofonUtils.log("favorite/destroy error:" + Number(req.status));
    }
  },

  favorites_create: function(obj, req, context) {
    if (obj) {
      this.toggleFavorite(context.user_id, obj.id_str, true);
    }
    else if (Number(req.status) == 403) {
      this.toggleFavorite(context.user_id, context.message_id, true);
    }
    else {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  statuses_update: function(obj, req, context) {
    if (!obj) {
      context.context.error = context._errorMessage;
      EchofonUtils.notifyObservers("failedToSendMessage", context.context);
      return;
    }
    if (obj.error) {
      context.context.error = obj.error;
      EchofonUtils.notifyObservers("failedToSendMessage", context.context);
      return;
    }

    var status = new EchofonModel.Status(obj, "home", context.user_id);
    status.unread = true;
    status.insertIntoDB();

    this.timelineLoader.timelines.insert(status);
    EchofonUtils.notifyObservers("tweetDidSend", status);

    // do samething if tweet has mention
    if (status.has_mention) {
      var mention = new EchofonModel.Status(obj, "mentions", context.user_id);
      mention.insertIntoDB();

      this.timelineLoader.timelines.insert(mention);
      EchofonUtils.notifyObservers("tweetDidSend", mention);
    }
  },

  direct_messages_new: function(obj, req, context) {
    if (obj) {
      if (obj.error) {
        EchofonUtils.notifyObservers("failedToSendMessage", context.context);
        return;
      }
      this.timelineLoader.retrieveMessages([obj]);
    }
    else {
      try {
        var val = JSON.parse(req.responseText);
        if (val.error) {
          context.context.error = val.error;
        }
        EchofonUtils.notifyObservers("failedToSendMessage", context.context);
      }
      catch (e) {
        EchofonUtils.notifyObservers("failedToSendMessage", context.context);
      }
    }
  },

  loadConfiguration: function() {
    var conf = JSON.parse(this._pref.getCharPref("configuration"));
    if (!conf.lastUpdated || parseInt(Date.now()) - conf.lastUpdated > 24 * 60 * 60 * 1000) {
      var tc = new TwitterClient(null, this);
      tc.get("help.configuration", null);
    }
  },

  help_configuration: function(obj, req, context) {
    var conf = {config:obj, lastUpdated:parseInt(Date.now())};
    this._pref.setCharPref("configuration", JSON.stringify(conf));
  },

  // Migrate from version 1.9.x to 2.0
  //
  migrateV1toV2: function() {
    try {
      var tokens = this._pref.getCharPref("token");
      var sync = null;
      var accounts = {};
      var synckey = {};
      if (tokens) {

        tokens = JSON.parse(tokens);
        try {
          sync = JSON.parse(this._pref.getCharPref("synckey"));
        }
        catch (e) {}
        var current = this._pref.getCharPref("currentUser");

        if (tokens[current.toLowerCase()]) {
          this._pref.setCharPref("activeUserIdStr", tokens[current].user_id);
        }

        for (var i in tokens) {
          var token = tokens[i];
          accounts[token.user_id] = token;
          if (sync && sync[i]) {
            synckey[token.user_id] = {key:sync[i].key, sync:{timeline:sync[i].timeline, replies:sync[i].replies, messages:sync[i].messages}};
          }
        }
      }
      this._pref.setCharPref("accounts", JSON.stringify(accounts));
      this._pref.setCharPref("sync", JSON.stringify(synckey));
      this._pref.setCharPref("applicationMode", "panel");

      this._pref.deleteBranch("token");
      this._pref.deleteBranch("synckey");
      this._pref.deleteBranch("currentUser");
    }
    catch (e) {
      return;
    }

    try {
      var host = "chrome://echofon";
      var loginMgr = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
      var logins = loginMgr.findLogins({}, "chrome://echofon", "", null);
      for (var i = 0; i < logins.length; ++i) {
        loginMgr.removeLogin(logins[i]);
      }
    }
    catch (e) {
      this.log("Can't remove user's password: " + e.message);
    }
  },

  migrateV2Next: function() {
    // activeUserId to activeUserIdStr (GitHub PR #52)
    try {
      var activeUserId = this._pref.getIntPref("activeUserId");
      this._pref.setCharPref("activeUserIdStr", activeUserId > 0 ? activeUserId.toString() : '');
      this._pref.deleteBranch("activeUserId");
    }
    catch (e) {}
  },

  clearDatabase: function() {
    var accounts = EchofonAccountManager.instance().allAccounts();
    for (var i in accounts) {
      var acct = accounts[i];
      var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
      file.append('echofon_' + acct.user_id + '.sqlite');
      if (file.exists()) {
        file.remove(false);
      }
      this._pref.setBoolPref("clearDB", false);
    }
  },

  // Utilities
  //
  handleCommand: function(data) {
    var msg = JSON.parse(data);
    if (this[msg.command]) {
      try {
        this[msg.command](msg);
      }
      catch (e) {
        Components.utils.reportError(e.message + " in " + msg.command + "(" + e.fileName + ":" + e.lineNumber+")");
      }
    }
  },

  alertMessage: function(msg) {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    prompt.alert(null, "Echofon", msg);
  },

  // for nsISupports
  //
  QueryInterface: function(aIID) {
    // add any other interfaces you support here
    if (!aIID.equals(Ci.nsISupports) &&
        !aIID.equals(Ci.nsIObserver) &&
        !aIID.equals(Ci.nsIEchofon))
        throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  },

  // for nsIObserver
  //
  observe: function(subject, topic, data) {

    switch (topic) {
    case "echofon-command":
      this.handleCommand(data);
      break;

    case "quit-application-granted":
      this.destroy();
      break;

    case "quit-application":
      this._pref.setCharPref("lastTab", "home");
      var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
      obs.removeObserver(this, "quit-application");
      break;

    }
  }
}

//=================================================
// Note: You probably don't want to edit anything
// below this unless you know what you're doing.
//
const CLASS_ID = Components.ID("3c4bfeef-c936-0d98-8fb9-b9b28e4f28ed");
const CLASS_NAME = "Echofon"
const CONTRACT_ID = "@echofon.com/echofon;1";

// Singleton
var gEchofon = null;

// Factory
var EchofonFactory = {
  createInstance: function (aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    if (gEchofon === null) {
      gEchofon = new Echofon().QueryInterface(aIID);
    }
    return gEchofon;
  }
};

// Module
var EchofonModule = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);

    Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager)
        .addCategoryEntry("app-startup",
                          CLASS_NAME,
                          "service," + CONTRACT_ID,
                          true, true);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType)
  {
    aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);

    Cc["@mozilla.org/categorymanager;1"]
      .getService(Ci.nsICategoryManager)
        .deleteCategoryEntry("app-startup",
                             CLASS_NAME,
                             true);
  },

  getClassObject: function(aCompMgr, aCID, aIID)  {
    if (!aIID.equals(Ci.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(CLASS_ID))
      return EchofonFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

//module initialization
function NSGetModule(aCompMgr, aFileSpec) { return EchofonModule; }

function NSGetFactory(cid) {
  if (!CLASS_ID.equals(cid)) throw Components.results.NS_ERROR_FACTORY_NOT_REGISTERED;
  return EchofonFactory;
}
