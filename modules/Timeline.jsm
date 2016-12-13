//
// Implementation of Echofon timeline loader
//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["TimelineLoader"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

const STATE_INIT                  = 0;  // no streaming API called yet
const STATE_STREAMING             = 1;  // using streaming API
const STATE_STREAMING_RETRYING    = 2;  // trying to reconnect to streaming server

Cu.import("resource://echofon/Models.jsm");
Cu.import("resource://echofon/EchofonUtils.jsm");
Cu.import("resource://echofon/EchofonSync.jsm");
Cu.import("resource://echofon/TwitterClient.jsm");

const HOME_TIMELINE     = 'home';
const MENTIONS_TIMELINE = 'mentions';
const DM_TIMELINE       = 'messages';
const LIST_TIMELINE     = 'lists';
const SEARCH_TIMELINE   = 'search';

//
// Timeline
//

function TimelineBase() {}

TimelineBase.prototype = {
  restoreAsync: function(callback) {
    if (this.type) {
      var obj = this;
      var handler = {
        handleResult: function(aResultSet) {
          for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
            obj.tweets.push(EchofonModel.Status.initWithRow(row, obj.type, obj.user_id));
          }
        },

        handleError: function(aError) {
          EchofonUtils.reportError("Failed to restore Timeline: " + aError.message);
          callback();
        },
        handleCompletion: function(aReason) {
          callback();
        }
      };
      EchofonModel.Status.restoreAsync(this.user_id, this.type, 20, handler);
    }
  },

  insertTweet: function(tweet) {
    if (this.tweets.length == 0) {
      this.tweets.push(tweet);
      return true;
    }

    if (tweet.metadata && tweet.metadata.result_type == "popular") {
      this.tweets.splice(0,0,tweet);
      return true;
    }

    // check duplicate, insert with sort by id
    for (var i in this.tweets) {
      var t = this.tweets[i];
      if (t.id == tweet.id) return false;
      if (parseInt(t.id) < parseInt(tweet.id)) {
        this.tweets.splice(i, 0, tweet);
        this.compaction();
        return true;
      }
    }
    this.tweets.push(tweet);
    this.compaction();
    return true;
  },

  sinceId: function() {
    for (var i in this.tweets) {
      if (this.tweets[i].user.id != this.user_id) return this.tweets[i].id;
    }
    return 0;
  },

  loadMore: function(count, max_id) {
    for (var i = 0; i < this.tweets.length; ++i) {
      var tweet = this.tweets[i];
      if (tweet.metadata && tweet.metadata.result_type == "popular") continue;
      if (EchofonModel.DBM._64bitsub(this.tweets[i].id, max_id) > 0) continue;
      return this.tweets.slice(i, i+count);
    }
    return null;
  },

  appendTweets: function(tweets) {
    for (var i in tweets) {
      this.tweets.push(tweets[i]);
    }
  },

  deleteTweet: function(tweetId) {
    var index = -1;
    for (var i =0; i < this.tweets.length; ++i) {
      var t = this.tweets[i];
      if (t.id == tweetId) {
        index = i;
        break;
      }
    }
    if (index >= 0) {
      this.tweets.splice(index, 1);
    }
  },

  toggleFavorite: function(tweetId, favorited) {
    for (var i in this.tweets) {
      var t = this.tweets[i];
      if (t.id == tweetId) {
        t.favorited = favorited;
        break;
      }

      if (parseInt(t.id) < parseInt(tweetId)) {
        break;
      }
    }
  },

  blockUser: function(userId) {
    var statuses = [];

    for (var i in this.tweets) {
      var t = this.tweets[i];
      if (t.user.id != userId) {
        statuses.push(t);
      }
    }
    delete this.tweets;
    this.tweets = statuses;
  },

  retweet: function(tweetId, tweet, is_undo) {
    for (var i in this.tweets) {
      var t = this.tweets[i];
      if (t.id == tweetId) {
	if (is_undo) {
          t.retweeted_at = 0;
          t.retweeter_screen_name = "";
          t.retweeted_status_id = "";
          t.retweeter_user_id = 0;
	}
	else {
          t.retweeted_at = tweet.created_at;
          t.retweeter_screen_name = tweet.user.screen_name;
          t.retweeted_status_id = tweet.id;
          t.retweeter_user_id = tweet.user.id;
        }
        break;
      }

      if (parseInt(t.id) < parseInt(tweetId)) {
        break;
      }
    }
  },

  markRead: function() {
    for (var i in this.tweets) {
      var t = this.tweets[i];
      t.unread = false;
    }
  },

  syncUnread: function(id) {
    var c = 0;
    for (var i in this.tweets) {
      var t = this.tweets[i];
      if (EchofonModel.DBM._64bitsub(t.id, id) > 0) continue;
      if (!t.unread) break;
      t.unread = false;
      c++;
    }
    return c;
  },

  compaction: function() {
    if (this.tweets.length > 1000) {
      this.tweets.splice(500, 1000);
    }
  },

  toString: function() {
    return this.type + " timeline (" + this.tweets.length + "tweets)";
  }
};

//
// Home Timeline
//
function HomeTimeline(user_id)
{
  this.user_id = user_id;
  this.tweets = [];
  this.type = "home";
}

HomeTimeline.prototype = new TimelineBase();

//
// Mentions Timeline
//
function MentionsTimeline(user_id)
{
  this.user_id = user_id;
  this.type = "mentions";
  this.tweets = [];
}

MentionsTimeline.prototype = new TimelineBase();

//
// DM Timeline
//
function DMTimeline(user_id)
{
  this.user_id = user_id;
  this.type = "message";
  this.tweets = [];
}

DMTimeline.prototype = new TimelineBase();

DMTimeline.prototype.restoreAsync = function(callback)
{
  if (this.type) {
    var obj = this;
    var handler = {
      handleResult: function(aResultSet) {
        for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
          var t = EchofonModel.Thread.initWithRow(row, obj.user_id);
          if (t.recipient_id != obj.user_id)
            obj.tweets.push(t);
        }
      },

      handleError: function(aError) {
        EchofonUtils.reportError("Failed to restore Timeline: " + aError.message);
        callback();
      },
      handleCompletion: function(aReason) {
        callback();
      }
    };
    EchofonModel.Thread.restoreAsync(this.user_id, 20, handler);
  }
}

DMTimeline.prototype.insertTweet = function(message)
{
  function sortThread(a, b) {
    return b.updated_at - a.updated_at;
  }
  var user = (message.isSent) ? message.recipient : message.sender;
  for (var i = 0; i < this.tweets.length; ++i) {
    var t = this.tweets[i];
    if (t.recipient_id == user.id) {
      var updated_at = new Date(message.created_at).getTime();
      if (t.updated_at < updated_at) {
        t.id = message.id;
        t.text = message.text;
        t.updated_at = updated_at;
      }
      if (message.unread) {
        t.unread += 1;
      }
      this.tweets.sort(sortThread);
      return true;
    }
  }

  var t = EchofonModel.Thread.findByRecipientId(this.user_id, user.id);
  if (t) {
    if (message.unread) {
      t.unread +=1;
    }
  }
  else {
    t = new EchofonModel.Thread(this.user_id, message);
  }
  this.tweets.push(t);
  this.tweets.sort(sortThread);

  return true;
}

DMTimeline.prototype.blockUser = function(userId)
{
  for (var i = 0; i < this.tweets.length; ++i) {
    var t = this.tweets[i];
    if (t.recipient_id == userId) {
      this.tweets.splice(i, 1);
      break;
    }
  }
}

DMTimeline.prototype.markReadThread = function(id)
{
  for (var i in this.tweets) {
    var t = this.tweets[i];
    if (t.id == id) {
      t.unread = false;
      return;
    }
  }
}



//
// List Timeline
//
function ListTimeline(user_id, list_id)
{
  this.user_id = user_id;
  this.list_id = list_id;
  this.type = "list";
  this.lists = {};
  this.tweets = [];
  this.changeList(list_id);
}

ListTimeline.prototype = new TimelineBase();

ListTimeline.prototype.changeList = function(list_id)
{
  // save current
  try {
    if (this.list_id) {
      this.lists[this.list_id] = this.tweets;
    }
  }
  catch (e) {}

  if (!list_id) {
    this.list_id = 0;
    return;
  }

  if (this.lists[list_id]) {
    this.tweets = this.lists[list_id];
  }
  else {
    this.lists[list_id] = [];
    this.tweets = [];
  }
  this.list_id = list_id;
}

ListTimeline.prototype.sinceId = function(list_id)
{
  if (!list_id || this.list_id == list_id) {
    return this.tweets.length ? this.tweets[0].id : 0;
  }
  else if (this.lists[list_id] && this.lists[list_id].length) {
    return this.lists[list_id][0].id;
  }
  return 0;
}

//
// Search Timeline
//
function SearchTimeline(user_id, query)
{
  this.user_id = user_id;
  this.query = query;
  this.type = "search";
  this.tweets = [];
}

SearchTimeline.prototype = new TimelineBase();

SearchTimeline.prototype.sinceId = function()
{
  for (var i in this.tweets) {
    var t = this.tweets[i];
    if (t.user.id != this.user_id) {
      if (t.metadata && t.metadata.result_type == "popular") continue;
      return this.tweets[i].id;
    }
  }
  return 0;
}

//
// Timelines
//

const gTimelineType = [HOME_TIMELINE, MENTIONS_TIMELINE, DM_TIMELINE, LIST_TIMELINE, SEARCH_TIMELINE];

function Timelines(token)
{
  this.token = token;
  var user_id = token.user_id;
  var list_id = 0;
  if (token.list_id) {
    list_id = token.list_id;
  }

  var query = '';
  if (token.query) {
    query = token.query;
  }

  this.timelines = {'home':new HomeTimeline(user_id),
		    'mentions':new MentionsTimeline(user_id),
		    'messages':new DMTimeline(user_id),
		    'lists':new ListTimeline(user_id, list_id),
		    'search':new SearchTimeline(user_id, query)};
}

Timelines.prototype = {
  tweets: function(type) {
    return this.timelines[type].tweets;
  },

  getRecentTweets: function(type) {
    var tweets = this.timelines[type].tweets;
    if (tweets.length == 0) return [];
    var ret = tweets.slice(0, 20);
    var last = ret[ret.length-1];
    if (!last.unread) return ret;

    for (var i = ret.length; i < tweets.length; ++i) {
      var t = tweets[i];
      ret.push(tweets[i]);
      if (!t.unread) {
        return ret;
      }
    }
    return ret;
  },

  getTimeline: function(type) {
    return this.timelines[type];
  },

  getUnread: function() {
    var ret = [];
    for (var i in this.timelines) {
      var tl = this.timelines[i];
      if (tl.tweets.length && tl.tweets[0].unread) {
        ret.push(true);
      }
      else {
        ret.push(false);
      }
    }
    return ret;
  },

  getUnreadCount: function() {
    var ret = {};
    for (var tab in this.timelines) {
      var tl = this.timelines[tab];
      var unread = 0;
      for (var i = 0; i < tl.tweets.length; ++i) {
	if (tl.tweets[i].unread) ++unread;
      }
      ret[tab] = unread;
    }
    return ret;
  },

  insert: function(tweet) {
    if (this.timelines[tweet.type]) {
      return this.timelines[tweet.type].insertTweet(tweet);
    }
    return false;
  },

  deleteTweet: function(tweetId) {
    this.timelines[HOME_TIMELINE].deleteTweet(tweetId);
    this.timelines[MENTIONS_TIMELINE].deleteTweet(tweetId);
  },

  blockUser: function(user_id) {
    for (var i in this.timelines) {
      this.timelines[i].blockUser(user_id);
    }
  },

  toggleFavorite: function(tweetId, favorited) {
    EchofonModel.Status.toggleFavorite(this.token.user_id, tweetId, favorited);
    for (var i in this.timelines) {
      this.timelines[i].toggleFavorite(tweetId, favorited);
    }
  },

  retweet: function(tweetId, retweet, is_undo) {
    for (var i in this.timelines) {
      this.timelines[i].retweet(tweetId, retweet, is_undo);
    }
  },

  restore: function(callback) {
    this.restored = 0;
    for (var i = 0; i < 3; ++i) {
      var type = gTimelineType[i];
      var obj = this;
      this.timelines[type].restoreAsync(function() {
        if (++obj.restored == 3) {
          callback();
        }
      });
    }
  },

  updateSyncData: function(data) {
    if (data.user_id != this.token.user_id) return;
    var sync = data.data['sync'];

    var keys = {home:'timeline', mentions:'replies', messages:'messages'};
    var markReadCount = {};
    for (var tab in keys) {
      var id = sync[keys[tab]];
      markReadCount[tab] = this.getTimeline(tab).syncUnread(id);
      if (markReadCount[tab] > 0) {
        EchofonUtils.log("Mark read " + tab + ": " + markReadCount[tab]);
      }
    }
    EchofonUtils.notifyObservers("updateDMThreads", {user_id:this.token.user_id, threads:this.tweets(DM_TIMELINE)});
    EchofonUtils.notifyObservers("markReadBySync", markReadCount);
  },

  compaction: function() {
    for (var i in this.timelines) {
      this.timelines[i].compaction();
    }
  }
};

//
// Timeline Loader
//

function TimelineLoader(token)
{
  this.token = token;
  this.db =EchofonModel.DBM.db(token.user_id);

  this.list = null;
  this.sentCount = 0;
  this.listLoaded = null;
  this.blocksLoaded = null;
  this.savedSearchesLoaded = null;
  this.query = token.query;
}

TimelineLoader.prototype = {

  init: function(callback) {
    this.state = STATE_INIT;

    this.timelines = new Timelines(this.token);

    this.streamingRetryPeriod = 0;
    this.terminated = false;
    this.timelines.restore(callback);
  },

  start: function() {

    if (this.state != STATE_INIT) return;

    if (!EchofonUtils.isActiveUser(this.token)) return;


    if (!this.getBlocking()) {
      this.startSession();
    }

    // Clear previous error message
    this.notifyObservers("clearErrors");
  },

  notifyObservers: function(command, params) {
    // do not send anything if this timeline is not active
    if (!EchofonUtils.isActiveUser(this.token)) return;
    EchofonUtils.notifyObservers(command, params);
  },

  startSession: function() {
    if (this.terminated) return;
    if (this.state == STATE_INIT) {
      this.state = STATE_STREAMING;
      this.userStream = this.startStreaming();

      this.refreshTimeline();
      this.refreshList();

      this.setupTimer(EchofonUtils.pref().getIntPref("interval"));
    }
  },

  setupTimer: function(interval) {
    var target = this;
    interval = (this.userStream) ? 10 : interval;
    if (interval < 1) interval = 1;

    if (this.timelineTimer) this.timelineTimer.cancel();
    this.timelineTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.timelineTimer.initWithCallback({ notify: function() { target.refreshTimeline(); }}, interval * 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);

    var listInterval = (interval < 3) ? 3 : interval;

    if (this.listTimer) this.listTimer.cancel();
    this.listTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.listTimer.initWithCallback({ notify: function() { target.refreshList(); }}, listInterval * 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  refreshTimeline: function(force) {
    if (this.terminated) return;

    this.getTweets(HOME_TIMELINE);
    this.getTweets(MENTIONS_TIMELINE);
    this.getDMs("messages");

    var sent = true;
    if (!force && !this.userStream) {
      if (this.sentCount++ % 3 != 0) {
      	sent = false;
      }
    }
    if (sent) {
      this.getDMs("sent");
    }
    this.getBlocking();

    if (!this.query) return;
    var now = Date.now();
    if (force || (!this.lastRefresh || now - this.lastRefresh > 3 * 60 * 1000)) {
      this.searchTweets(this.query, 0, true);
      this.lastRefresh = now;
    }
  },

  refreshList: function() {
    if (this.terminated) return;

    if (this.token.list_id) {
      var list = this.list;
      if (!list) {
      	list = EchofonModel.List.findById(this.token.user_id, this.token.list_id);
      }
      if (!list && !this.listLoaded) {
        this.getLists();
      }
      else {
        this.getListTimeline(list);
      }
    }
  },

  getBlocking: function() {
    if (!this.userStream) return false;

    var now = Date.now();
    if (!this.blocksLoaded || now - this.blocksLoaded > 60 * 60 * 1000) {
      this.get('blocks.ids', {});
      this.get('friendships.no_retweets.ids', {});
      return true;
    }
    return false;
  },

  get: function(method, params, callback) {
    if (this.terminated) return;
    var req = new TwitterClient(this.token, this);
    req.get(method, params, callback);
  },

  getTweets: function(type, max_id) {
    if (this.terminated) return;

    var since_id = this.timelines.getTimeline(type).sinceId();
    if (since_id) {
      since_id =EchofonModel.DBM.calcSnowflakeId(since_id, 5);
    }
    var method = type == MENTIONS_TIMELINE ? 'mentions_timeline' : 'home_timeline';
    var params = {include_entities:true};
    if (max_id) {
        params['max_id'] = max_id;
    }
    else {
      if (since_id) {
        params['since_id'] = since_id;
        params['count'] = 200;
      }
    }
    this.get('statuses.' + method, params);
  },

  getDMs: function(type, max_id) {
    if (this.terminated) return;

    var since_id = EchofonModel.DirectMessage.getLatestId(this.token.user_id, type);
    var method = type == 'messages' ? '' : '.sent';
    var params = {include_entities:true};
    if (max_id) {
      params['max_id'] = max_id;
    }
    else {
      if (since_id) {
        params['since_id'] = since_id;
        params['count'] = 200;
      }
    }
    this.get('direct_messages' + method, params);
  },

  getOlderDMs: function() {
    if (this.terminated) return;

    this.get('direct_messages',
             {include_entities:true, count:100,
              max_id:EchofonModel.DirectMessage.getEarliestId(this.token.user_id, "messages")});

    this.get('direct_messages.sent',
             {include_entities:true, count:100,
              max_id:EchofonModel.DirectMessage.getEarliestId(this.token.user_id, "sent")});

  },

  getLists: function() {
    if (this.terminated) return;

    var now = Date.now();
    if (!this.listLoaded || now - this.listLoaded > 60 * 60 * 1000) {
      this.get('lists.list', {});
    }
  },

  getSavedSearches: function() {
    if (this.terminated) return;

    var now = Date.now();
    if (!this.savedSearchesLoaded || now - this.savedSearchesLoaded > 60 * 60 * 1000) {
      this.get('saved_searches.list', {});
    }
  },

  getListTimeline: function(list, max_id) {
    if (this.terminated) return;

    if (list == null) {
      this.list = null;
      this.timelines.getTimeline(LIST_TIMELINE).tweets = [];
      return;
    }

    if (list.id != this.token.list_id) return;

    var req = new TwitterClient(this.token, this);
    req.list = list;
    var params = {include_entities:true};
    if (max_id) {
        params['max_id'] = max_id;
    }
    else {
      this.list = list;
      var sinceId = this.timelines.getTimeline(LIST_TIMELINE).sinceId(list.id);
      if (sinceId) {
        params['since_id'] = sinceId;
        params['per_page'] = 200;
      }
    }
    params['user_id'] = list.user.id;
    params['list_id'] = list.id;
    this.get('lists.statuses', params);
  },

  lists_statuses: function(resp, req, context) {
    if (resp) {
      this.retrieveTweets(resp, LIST_TIMELINE, context);

      if (context.param.max_id && resp.length == 0) {
        this.notifyObservers("removeLoadMoreCell", 'mentions');
      }
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
 },

  isUnread: function(msg) {
    var sinceId = this.timelines.getTimeline(msg.type).sinceId();
    if (sinceId == 0) return false;

    if (EchofonSync.instance().isUnread(this.token.user_id, msg.type, msg.id)) {
      if (EchofonModel.DBM._64bitsub(sinceId, msg.id) >= 0) {
        return false;
      }
      else {
        return true;
      }
    }
    else {
      return false;
    }
  },

  retrieveTweets : function(obj, type, context) {
    if (obj == null) return;
    if (this.terminated) return;

    var writer = null;
    if (type == HOME_TIMELINE || type == MENTIONS_TIMELINE) {
      writer = new EchofonModel.StatusWriter(EchofonModel.DBM.db(this.token.user_id), type);
    }
    if (writer && context.param.max_id) {
      writer.checkUserTimestamp = true;
    }

    var tweets = [];
    for (var i = obj.length - 1; i >= 0; --i) {

      if (EchofonSync.instance().isMuted(this.token.user_id, obj[i], type)) continue;

      var tweet = new EchofonModel.Status(obj[i], type, this.token.user_id);
      if (tweet.retweeter_user_id) {
        if (!EchofonModel.NoRetweet.wantsRetweet(this.token.user_id, tweet.retweeter_user_id)) {
        continue;
        }
      }
      //if (EchofonModel.Status.exist(this.token.user_id, type, tweet.id)) continue;

      tweet.unread = this.isUnread(tweet);
      if (writer) {
        writer.addTweet(tweet);
      }
      if (this.timelines.insert(tweet)) {
        tweets.unshift(tweet);
      }
    }
    EchofonUtils.debug("Received " + obj.length + " (" + tweets.length + " new) " + type);

    if (writer) {
      writer.executeAsync();
    }

    if (context.param.max_id) {
      this.notifyObservers("receivedNextPage", {type:type, msgs:tweets});
    }
    else {
      this.notifyObservers("receivedNewTweets", {user_id:this.token.user_id, tweets:tweets, type:type});
    }
  },

  retrieveMessages: function(obj) {
    if (this.terminated) return;
    var messages = [];

    var numUnread = 0;
    var writer = new EchofonModel.DirectMessageWriter(EchofonModel.DBM.db(this.token.user_id));
    var isSent = false;

    for (var i = obj.length - 1; i >= 0; --i) {
      if (EchofonModel.DirectMessage.exist(this.token.user_id, obj[i].id_str)) continue;

      var msg = new EchofonModel.DirectMessage(obj[i], this.token.user_id);
      writer.addMessage(msg);
      isSent = msg.isSent;

      if (!msg.isSent && this.isUnread(msg)) {
        msg.unread = true;
        numUnread++;
      }
      messages.unshift(msg);
    	this.timelines.insert(msg);
    }
    writer.executeAsync();

    EchofonUtils.debug("Received " + obj.length + " (" + numUnread + " new) DM");
    this.notifyObservers("receivedNewTweets", {user_id:this.token.user_id, tweets:messages, type:DM_TIMELINE});
    this.notifyObservers("updateDMThreads", {user_id:this.token.user_id, threads:this.timelines.tweets(DM_TIMELINE)});
  },


  startStreaming: function() {
    this._timer = null;
    if (EchofonUtils.isActiveUser(this.token)) {
      try {
        this.stream = new TwitterClient(this.token, this);
        this.stream.stream(this.query);
        EchofonUtils.debug("Start streaming" + ((this.query) ? " with query " + this.query : "") + " for " + this.token.screen_name + "...");
      }
      catch (e) {
        return false;
      }
    }
    return true;
  },

  stop: function() {
    this.terminated = true;

    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }

    try {
      this.stream.abort();
    }
    catch (e) {}
    this.stream = null;
    if (this.timelineTimer) {
      this.timelineTimer.cancel();
      this.timelineTimer = null;
    }

    if (this.listTimer) {
      this.listTimer.cancel();
      this.listTimer = null;
    }

    this.timelines = null;
  },

  //
  // REST API callback
  //
  statuses_home_timeline : function(resp, req, context) {
    if (resp) {
      this.retrieveTweets(resp, HOME_TIMELINE, context);

      if (context.param.max_id && resp.length == 0) {
        this.notifyObservers("removeLoadMoreCell", 'home');
      }
    }
    else if (Number(req.status) < 500) {
      if (Number(req.status) == 401) {
        EchofonUtils.notifyObservers("failedToAuth", {message:context._errorMessage, screen_name:context.screen_name});
      }
      else {
        EchofonUtils.notifyObservers("APIError", context._errorMessage);
      }
    }
  },

  statuses_mentions_timeline : function(resp, req, context) {
    if (resp) {
      this.retrieveTweets(resp, MENTIONS_TIMELINE, context);

      if (context.param.max_id && resp.length == 0) {
        this.notifyObservers("removeLoadMoreCell", 'mentions');
      }
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  direct_messages : function(resp, req, context) {
    if (resp) {
      this.retrieveMessages(resp);
    }
    else {
      if (Number(req.status) == 403) {
	// This will happen after Twitter turns on new permission level on June 14, 2011
        EchofonUtils.notifyObservers("needToReAuth", this.token.screen_name);
      }
      else if (Number(req.status) < 500) {
        EchofonUtils.notifyObservers("APIError", context._errorMessage);
      }
    }
  },

  direct_messages_sent : function(resp, req, context) {
    if (resp) {
      this.retrieveMessages(resp);
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  lists_list: function(resp, req, context) {
    if (resp) {
      var lists = [];
      for (var i in resp) {
        lists.push(new EchofonModel.List(resp[i], this.token.user_id));
      }
      EchofonModel.List.deleteAndUpdateAll(this.token.user_id, lists);
      this.listLoaded = Date.now();
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  blocks_ids: function(resp, req, context) {
    if (resp) {
      EchofonModel.Blocking.update(this.token.user_id, resp);
      this.blocksLoaded = Date.now();
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
    this.startSession();
  },

  friendships_no_retweets_ids: function(resp, req, context) {
    if (resp) {
      EchofonModel.NoRetweet.update(this.token.user_id, resp);
    }
    else {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  saved_searches_list: function(resp, req, context) {
    if (resp) {
      var ss = [];
      for (var i in resp) {
        ss.push(new EchofonModel.SavedSearch(resp[i], this.token.user_id));
      }
      EchofonModel.SavedSearch.deleteAndUpdateAll(this.token.user_id, ss);
      this.savedSearchesLoaded = Date.now();
      this.notifyObservers("updateSavedSearches", resp);
    }
    else {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  searchTweets: function(query, max_id, no_stream) {
    if (this.query != query) {
      this.timelines.getTimeline(SEARCH_TIMELINE).tweets = [];
    }
    this.query = query;
    var req = new TwitterClient(this.token, this);
    req.query = query;
    var params = {'include_entities':true, 'q':query};
    if (max_id) {
        params['max_id'] = max_id;
    }
    else {
      var sinceId = this.timelines.getTimeline(SEARCH_TIMELINE).sinceId();
      if (this.stream && sinceId) {
        sinceId =EchofonModel.DBM.calcSnowflakeId(sinceId, 5);
      }
      if (sinceId) {
        params['since_id'] = sinceId;
        params['count'] = 100;
      }
      else {
        params['result_type'] = 'mixed';
      }
    }
    //req.endpoint = "api.twitter.com/";
    req.get("search.tweets", params);

    if (!max_id && !no_stream) {
      if (this._timer) {
        this._timer.cancel();
        this._timer = null;
      }

      if (this.searchStream) {
        this.searchStream.abort();
        this.searchStream = null;
      }
      try {
        this.searchStream = new TwitterClient(this.token, this);
        this.searchStream.stream(query);
      }
      catch (e) {
        this.searchStream = null;
      }
    }
  },

  search: function(resp, req, context) {
    if (resp) {
      this.retrieveTweets(resp.results, SEARCH_TIMELINE, context);

      if (context.param.max_id && resp.results.length == 0) {
        this.notifyObservers("removeLoadMoreCell", SEARCH_TIMELINE);
      }

      if (resp.results.length == 0 && this.timelines.tweets(SEARCH_TIMELINE).length == 0) {
        this.notifyObservers("removeLoadMoreCell", SEARCH_TIMELINE);
      }
    }
    else if (Number(req.status) < 500) {
      EchofonUtils.notifyObservers("APIError", context._errorMessage);
    }
  },

  clearSearch: function() {
    this.timelines.getTimeline(SEARCH_TIMELINE).tweets = [];
    this.query = null;
    this.startStreaming();
  },

  //
  // Streaming API callback
  //
  update_friends: function(friends, client) {
    EchofonUtils.notifyObservers("clearError");
    if (client == this.searchStream) {
      EchofonUtils.debug("============= Switch streaming connection =================");
      if (this.stream) {
        this.stream.abort();
      }
      this.stream = this.searchStream;
      this.searchStream = null;
    }
    this.streamingRetryPeriod = 0;
    this.state = STATE_STREAMING;

    EchofonUtils.debug("Received " + friends.length + " friends for " + this.token.screen_name);
    EchofonModel.User.updateFollowing(this.db, friends);
  },

  status_received: function(status) {
    // TODO: remove when Twitter changes Streaming API to extended mode
    status.full_text = (status.extended_tweet && status.extended_tweet.full_text) || status.text;
    status.entities = (status.extended_tweet && status.extended_tweet.entities) || status.entities;
    if (status.retweeted_status) {
      var retweet = status.retweeted_status;
      retweet.full_text = (retweet.extended_tweet && retweet.extended_tweet.full_text) || retweet.text;
      retweet.entities = (retweet.extended_tweet && retweet.extended_tweet.entities) || retweet.entities;
    }

    var tweet = new EchofonModel.Status(status, HOME_TIMELINE, this.token.user_id);

    // Do not display blocked user
    if (EchofonModel.Blocking.isBlocking(this.token.user_id, tweet.user.id)) return;

    if (tweet.retweeter_user_id) {
      if (!EchofonModel.NoRetweet.wantsRetweet(this.token.user_id, tweet.retweeter_user_id)) {
        return;
      }
    }

    // If tweet isn't from following and doesn't have retweeted status, it should be mentions or search results
    //
    if (tweet.user.id != this.token.user_id && !tweet.user.isFollowing() && !tweet.retweeted_status_id) {
      if (tweet.has_mention) {
        tweet.type = MENTIONS_TIMELINE;
      }
      else {
        // if tweet has 'text@screen_name', it should be discarded
        var pat = new RegExp("@(" + this.token.screen_name + ")([^A-Za-z_].*)?$");
        if (pat.test(tweet.text)) {
          return;
        }
        tweet.type = SEARCH_TIMELINE;
      }
    }
    if (tweet.retweeter_user_id && !EchofonModel.User.isFollowing(tweet.retweeter_user_id, this.token.user_id)) {
      tweet.type = SEARCH_TIMELINE;
    }

    // Avoid to insert search tweets after re-connectiing user streams
    if (tweet.type == SEARCH_TIMELINE && !this.query) return;

    tweet.unread = true;

    var isInHome = false;

    // insert status into home timeline only if user is not muted (mute is not applied to mentions and searches)
    if (!EchofonSync.instance().isMuted(this.token.user_id, status, tweet.type)) {
      if (!EchofonModel.Status.exist(this.token.user_id, HOME_TIMELINE, tweet.id, tweet.retweeted_status_id)) {
        tweet.insertIntoDB();
        isInHome = true;
      }
    }
    if (isInHome || tweet.type != HOME_TIMELINE) {
      // do not insert retweet in serarch timeline
      if (!(tweet.type == SEARCH_TIMELINE && tweet.retweeted_status_id)) {
        if (this.timelines.insert(tweet)) {
          this.notifyObservers("receivedNewTweets", {user_id:this.token.user_id, tweets:[tweet], type:tweet.type});
        }
      }
    }

    // Check mentions from following users.
    //
    if (tweet.type != MENTIONS_TIMELINE && tweet.has_mention) {
      var mention = new EchofonModel.Status(status, MENTIONS_TIMELINE, this.token.user_id);
      mention.insertIntoDB();
      // do not mark read if it's already in home timeline
      if (!isInHome) {
        mention.unread = true;
      }
      if (this.timelines.insert(mention)) {
        this.notifyObservers("receivedNewTweets", {user_id:this.token.user_id, tweets:[mention], type:MENTIONS_TIMELINE});
      }
    }
  },

  direct_message_received: function(message) {
    this.retrieveMessages([message]);
  },

  event_received: function(obj) {
    switch (obj['event']) {
      case 'unfavorite':
      case 'favorite':
        if (obj.source.id == this.token.user_id) {
          this.timelines.toggleFavorite(obj['target_object'].id_str, obj['event'] == 'favorite');
        }
        this.notifyObservers("eventDidReceive", obj);
        break;

      case 'follow':
        if (obj.source.id == this.token.user_id) {
          EchofonModel.User.follow(obj.target.id, this.token.user_id);
        }
        this.notifyObservers("eventDidReceive", obj);
        break;

      case 'block':
        // Needs to send block event to sync server
        EchofonModel.Status.blockUser(this.token.user_id, obj.target.id);
        EchofonModel.DirectMessage.blockUser(this.token.user_id, obj.target.id);
        EchofonModel.Thread.blockUser(this.token.user_id, obj.target.id);
        this.timelines.blockUser(obj.target.id);
        EchofonModel.Blocking.create(this.token.user_id, obj.target.id);
        this.notifyObservers("didBlockUser", obj.target);
        break;

      case 'unblock':
        // Send unblock event to sync server
        EchofonModel.Blocking.destroy(this.token.user_id, obj.target.id);
        break;

      case 'list_created':
        var list = new EchofonModel.List(obj.target_object, this.token.user_id);
        list.insertIntoDB();
        break;

      case 'list_destroyed':
        EchofonModel.List.destroy(obj.target_object.id, this.token.user_id);
        break;

      case 'list_updated':
        var list = new EchofonModel.List(obj.target_object, this.token.user_id);
        list.insertIntoDB();
        break;

      default:
        EchofonUtils.dumpall(obj);
        break;
    }
  },

  delete_received: function(obj) {
    if (obj['status']) {
      var info = obj['status'];
      EchofonModel.Status.destroy(info.id_str, this.token.user_id);
      this.timelines.deleteTweet(info.id_str);
      this.notifyObservers("tweetDidDelete", {user_id:info.user_id_str, id:info.id_str});
    }
    else {
    }
  },

  retryStreaming: function(fillWithRESTAPI) {
    if (this.terminated) return;

    // retry user streams if appropriate
    if (this.state == STATE_STREAMING) {
      // if this is first failure, re-connect immediately
      if (fillWithRESTAPI) {
        this.refreshTimeline();
      }
      this.state = STATE_STREAMING_RETRYING;
      this.startStreaming();
      EchofonUtils.log("Re-connect User Streams immediately");
    }
    else if (this.state == STATE_STREAMING_RETRYING) {
      //wait a random period between 20 and 40 seconds.
      if (this.streamingRetryPeriod == 0) {
        this.streamingRetryPeriod = parseInt(Math.random() * 20 + 20);
      }
      else {
        this.streamingRetryPeriod *= 2;
        if (this.streamingRetryPeriod > 300) this.streamingRetryPeriod = 300;
      }
      EchofonUtils.log("Waiting for re-connct streaming server... " + this.streamingRetryPeriod);
      var target = this;
      this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._timer.initWithCallback({
	notify: function() {
          // fill gap with REST API
          target.getTweets(HOME_TIMELINE);
          target["startStreaming"]()}
      }, this.streamingRetryPeriod * 1000, Ci.nsITimer.TYPE_ONE_SHOT);
    }
  },

  too_many_stream_connections_error: function() {
    this.notifyObservers("alertMessage", "Twitter has stopped allowing additional connections. This may happen if searches are made too frequently, or if you are using multiple Twitter apps at the same time.");
    this.state = STATE_STREAMING_RETRYING;
    this.streamingRetryPeriod = 60;
    this.retryStreaming(false);
  },

  stream_error: function(req) {
    if (this.stream == req || this.searchStream == req) {
      Cu.reportError("User stream connection is disconnected.");
      this.retryStreaming(false);
    }
  },

  stream_timeout: function() {
    this.retryStreaming(true);
  }
}
