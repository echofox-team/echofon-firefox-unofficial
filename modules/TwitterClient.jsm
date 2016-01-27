
var EXPORTED_SYMBOLS = ["TwitterClient", "encodeURLParameter", "decodeURLParameter"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

Cu.import("resource://echofon/EchofonHttpRequest.jsm");

const TWITTER_API_URL    = "api.twitter.com/1.1/";

function getOAuthConsumerKey() {
  var prefs = Cc['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitternotifier.");
  const defaultKey = "yqoymTNrS9ZDGsBnlFhIuw";
  try {
    return prefs.getCharPref("customKey") || defaultKey;
  } catch(e) {
    return defaultKey;
  }
}

function convertToHexString(data)
{
  var toHexString = function(charCode) { return ("0" + charCode.toString(16)).slice(-2); };
  var arr = [];
  for (var i in data) {
    arr.push(toHexString(data.charCodeAt(i)));
  }
  return arr.join("");
}

function encodeURLParameter(dict)
{
  var keys = [];
  for (var key in dict) {
    keys.push(key);
  }
  keys.sort();

  var result = [];

  for (var i = 0; i < keys.length; ++i) {
    result.push(keys[i] + "=" + RFCEncoding(dict[keys[i]]));
  }
  return result.join("&");
}

function decodeURLParameter(str)
{
  var arr = str.split("&");
  var params = {};
  for (var i in arr) {
    var a = arr[i].split('=');
    params[a[0]] = a[1];
  }
  return params;
}

function RFCEncoding(str)
{
  var tmp = encodeURIComponent(str);
  tmp = tmp.replace(/\!/g, '%21');
  tmp = tmp.replace(/\*/g, '%2A');
  tmp = tmp.replace(/\(/g, '%28');
  tmp = tmp.replace(/\)/g, '%29');
  tmp = tmp.replace(/\'/g, '%27');
  return tmp;
}

Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/EchofonSign.jsm");
Components.utils.import("resource://echofon/Account.jsm");

//
// user = OAuth token result
//  - user_id
//  - screen_name
//  - oauth_token
//  - oauth_token_secret
//
function TwitterClient(user, target)
{
  // shortcut
  if (user) {
    this.screen_name = user.screen_name;
    this.user_id = user.user_id;
  }

  this._user = user;
  this._target = target;
  this._pref  = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch("extensions.twitternotifier.");
  this._errorMessage = "";
  this._errorCode = 0;
}

TwitterClient.buildOAuthHeader = function (user, method, url, param)
{
  var ts = Math.ceil(Date.now() / 1000);
  var diff = EchofonUtils.timestampDiff();
  if (diff != 0) {
    EchofonUtils.debug("local timestamp " + ts + " / server timetsamp " + (ts + diff));
    ts += diff;
  }

  var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = "UTF-8";
  var result = {};
  var data = converter.convertToByteArray(user + Date.now() + url + Math.random(), result);
  var ch = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  ch.init(ch.MD5);
  ch.update(data, data.length);
  var hash = ch.finish(false);

  var s = convertToHexString(hash);

  var oauthparam = {"oauth_consumer_key"     : getOAuthConsumerKey(),
		    "oauth_timestamp"        : ts,
		    "oauth_signature_method" : "HMAC-SHA1",
		    "oauth_nonce"            : s + Math.random(),
		    "oauth_version"          : "1.0"};

  if (user.oauth_token) {
    oauthparam["oauth_token"] = EchofonAccountManager.instance().get(user.user_id).oauth_token;
  }

  var dict = {};
  for (var key in param) dict[key] = param[key];
  for (var key in oauthparam) dict[key] = oauthparam[key];

  var paramStr = encodeURLParameter(dict);

  var base = [method, RFCEncoding(url), RFCEncoding(paramStr)].join("&");

  var signature;
  var secret = user.oauth_token_secret ? EchofonAccountManager.instance().get(user.user_id).oauth_token_secret : "";
  var signature = EchofonSign.OAuthSignature(base, secret);

  oauthparam['oauth_signature'] = signature;

  var headers = [];
  for (var key in oauthparam) {
    headers.push(key + '="' + RFCEncoding(oauthparam[key]) + '"');
  }
  headers.sort();

  return headers.join(",");
}

TwitterClient.prototype = {
  get: function(method, params, callback) {
    this._req = this.createRequest("GET", method, Object.assign({}, params, {tweet_mode: "extended"}), callback);
  },

  post: function(method, params, callback) {
    this._req = this.createRequest("POST", method, Object.assign({}, params, {tweet_mode: "extended"}), callback);
  },

  stream: function(query) {
    Cu.import("resource://echofon/UserStreams.jsm");
    var request = new UserStreams(this._user, this);
    var param = {include_entities:true};
    if (query) {
      param['track'] = query;
    }
    var authStr = TwitterClient.buildOAuthHeader(this._user, "GET", "https://userstream.twitter.com/1.1/user.json", param);
    request.setOAuthHeader(authStr, "");

    var target = this;

    var params = [];
    for (var key in param) {
      params.push(key + '=' + RFCEncoding(param[key]));
    }

    request.setURL('https://userstream.twitter.com/1.1/user.json?' + params.join('&'));
    request.onstream  = function() {target.onStream(request);};
    request.onstop    = function() {target.onStopStream(request);};
    request.onerror   = function(reason) {target.onErrorStream(reason);}

//    EchofonUtils.debug("Start user streams for " + this._user.screen_name);

    request.asyncOpen();
    this._req = request;
  },

  reopen: function() {
    this._req = this.createRequest(this._originalParams[0],
                                   this._originalParams[1],
                                   this._originalParams[2],
				   this._originalParams[3]);
  },

  abort: function() {
    if (this._req)
      this._req.abort();
  },

  createRequest: function(method, func, param, callback) {

    this._params = param;

    this._originalParams = [method, func, param, callback];

    var ns = func.split(".");
    var requestURL = "";

    var request = new EchofonHttpRequest();

    if (callback) request.callback = callback;

    if (ns.length > 1) {
      if (!callback) {
        request.callback = ns.join('_');
      }
      requestURL       = ns.join("/");
    }
    else {
      if (!callback) {
        request.callback = func;
      }
      requestURL       = func;
    }

    if (!this.endpoint) {
      this.endpoint = TWITTER_API_URL;
    }
    requestURL = "https://" + this.endpoint + requestURL + ".json";

    if (!param) param = {};

    if (this._user) {
      var oauthStr = TwitterClient.buildOAuthHeader(this._user, method, requestURL, param);
      request.setOAuthHeader(oauthStr, '');
    }

    this.requestURL = requestURL;


    // Setup callbacks
    //
    var target = this;

    this.param = param;

    request.onload    = function(p) {target.onLoad(request, param);}
    request.onerror   = function(p) {target.onError(request, param);}

    // send async request
    var requestParam = encodeURLParameter(param);
    if (method == "GET") {
      if (requestParam.length) {
        request.setURL(requestURL + '?' + requestParam);
      }
      else {
        request.setURL(requestURL);
      }
    }
    else {
      request.setURL(requestURL);
      request.setPostData(requestParam);
    }
//    EchofonUtils.debug(method + " " + request.requestURL);
    request.asyncOpen();

    return request;
  },

  //
  // Streaming API callbacks
  //
  onStream: function(req) {
    var resp = null;
    var err_msg = "(User Streams) - " + req.status + " " + req.statusText;

    var r = req.responseText.split('\r');

    for (var i in r) {
      try {
        if (r[i].match(/^[\r\n]+$/)) continue;
        resp = JSON.parse(r[i]);
        if (resp.error) {
          err_msg += " (" + resp.error + ")";
        }
        this.handleStreamingResponse(req, resp, err_msg);
      }
      catch (e) {EchofonUtils.dumpStackTrace(); throw e;}
    }
    req.responseText = "";
  },

  handleStreamingResponse: function(req, resp, err_msg) {
    switch (Number(req.status)) {
    case 200:
      if (resp) {
        if (resp['friends']) {
          this._target['update_friends'](resp['friends'], this);
        }
        else {
          if (resp['delete']) {
            this._target['delete_received'](resp['delete']);
          }
          else if (resp['event']) {
            this._target['event_received'](resp);
          }
          else if (resp['direct_message']) {
            this._target['direct_message_received'](resp['direct_message']);
          }
          else {
            this._target['status_received'](resp);
          }
        }
      }
      break;

    case 420:
      Cu.reportError(err_msg);
      if (this._target['too_many_stream_connections_error']) {
        this._target['too_many_stream_connections_error']();
      }
      break;

    case 401:
    default:
      this.handleError(req, null, "Failed to establish user streams: " + err_msg);
      break;

    }
  },

  onStopStream: function(req) {
    if (Number(req.status) == 420 && this._target['too_many_stream_connections_error']) {
        this._target['too_many_stream_connections_error']();
    }
    else if (this._target['stream_error']) {
      this._target['stream_error'](this);
    }
  },

  onErrorStream: function(reason) {
    Cu.reportError("Failed to establish user streams: Connection failed: " + reason);
    if (this._target['stream_error']) {
      this._target['stream_error'](this);
    }
  },

  //
  // REST API callbacks
  //
  onLoad: function(req, param) {
    try {
      EchofonUtils.debug(req.callback + " (" + this._user.screen_name + ") - " + req.status + " " + req.statusText +
                 " (Rate limit: " + req.getResponseHeader("X-Ratelimit-Remaining") + "/"
                 + req.getResponseHeader("X-Ratelimit-Limit") + ")");
    }
    catch (e) {}

    var resp = null;
    var err_msg = req.status + " " + req.statusText;
    try {
      resp = JSON.parse(req.responseText);
      if (resp.error) {
        err_msg += ": " + resp.error;
      }
    }
    catch (e) {
    }
    err_msg += " (" + req.callback + ")"

    if (Number(req.status) != 401) {
      if (this.user_id) {
        EchofonAccountManager.instance().get(this.user_id).clearOAuthError();
      }
    }

    switch (Number(req.status)) {
    case 200:
    case 304:
      if (resp == null) {
        EchofonUtils.debug('Can\'t decode JSON response: "' + req.responseText + '"');
        this.handleError(req, param, "Can't decode JSON. (" + err_msg + ")");
        return;
      }
      if (resp.error) {
          this.handleError(req, param, resp.error);
      }
      else {
        this._hasError = false;
        if (this._target[req.callback]) {
          this._target[req.callback](resp, req, this);
        }
        else {
          EchofonUtils.debug("No callback found: " + req.callback);
        }
      }
      break;

    case 400: // Rate limt
      if (resp && resp.error) {
        this.handleError(req, param, resp.error);
      }
      break;

    case 401:
      this.handleAuthError(req, param, resp);
      break;

    default:
      this.handleError(req, param, err_msg);
      break;

    }
  },

  onError: function(req, param) {
    try {
      resp = JSON.parse(req.responseText);
      if (resp.error)  this._errorMessage = resp.error;
      if (resp.status) this._errorCode = resp.status;
    }
    catch (e) {
    }
    if (this._errorMessage == "") {
      this._errorMessage = "Connection Failed for " + req.callback;
    }
    Cu.reportError(this._errorMessage);
    this._target[req.callback](null, req, this);
  },

  //
  // Error handler
  //
  handleAuthError: function(req, param, resp) {
    EchofonUtils.log("401 - " + req.requestURL + " (" + resp.error + ")");
    this._errorMessage = resp.error;
    //
    // Recover request if timestamp is skewed
    //
    if (resp && resp.error.match('Timestamp out of bounds')) {
      if (!EchofonUtils.hasServerTimestamp()) {
        EchofonUtils.log("Set timestamp by server");
        var localTimestamp = Math.ceil((new Date()).getTime() / 1000);
        var serverTimestamp = Math.ceil((new Date(req.getResponseHeader("Date"))).getTime() / 1000);
        EchofonUtils.setTimestampDiff(serverTimestamp - localTimestamp);
        this.reopen();
        return;
      }
    }
    this._target[req.callback](null, req, this);
  },

  handleError: function(req, param, msg) {
    this._errorMessage = msg;
    msg  = req.callback + ": " + msg;
    Cu.reportError(msg);
    this._target[req.callback](null, req, this);
  },

  //
  // OAuth
  //
  requestToken: function() {
    var request = new EchofonHttpRequest();

    var requestURL = "https://api.twitter.com/oauth/request_token";

    var param = {};
    request.setOAuthHeader(TwitterClient.buildOAuthHeader(this._user, "POST", requestURL, param), '');

    var target = this._target;
    request.onload    = function(p) {target.onGetRequestToken(request);}
    request.onerror   = function(p) {target.onErrorRequestToken(request);}

    request.setURL(requestURL);
    request.setPostData("");
    request.asyncOpen();
    this._req = request;
  },

  verifyToken: function(param) {
    var request = new EchofonHttpRequest();

    var requestURL = "https://api.twitter.com/oauth/access_token";

    request.setOAuthHeader(TwitterClient.buildOAuthHeader(this._user, "POST", requestURL, param), '');

    var target = this._target;
    request.onload    = function(p) {target.onVerifyToken(request);}
    request.onerror   = function(p) {target.onErrorVerifyToken(request);}

    request.setURL(requestURL);
    request.setPostData(encodeURLParameter(param));
    request.asyncOpen();

    this._req = request;
  },

  getAccessToken: function(password) {
    EchofonUtils.log("Get access token with xAuth for " + this._user.screen_name + "...");
    var request = new EchofonHttpRequest();

    var requestURL = "https://api.twitter.com/oauth/access_token";

    var param = {
      "x_auth_username":this._user.screen_name,
      "x_auth_password":password,
      "x_auth_mode":"client_auth"};
    request.setOAuthHeader(TwitterClient.buildOAuthHeader(this._user, "POST", requestURL, param), '');

    var target = this;
    request.onload    = function(p) {target.onLoad_GetAccessToken(request);}
    request.onerror   = function(p) {target.onError_GetAccessToken(request);}

    request.setURL(requestURL);
    request.setPostData(encodeURLParameter(param));
    request.asyncOpen();

    this._req = request;
  },

  onLoad_GetAccessToken: function(req) {

    var statusCode = Number(req.status);

    if (statusCode == 401) {
      var resp = {};
      try {
        resp = JSON.parse(req.responseText);
      }
      catch (e) {
        resp.error = req.responseText;
      }
      EchofonUtils.log("Failed to get auth token. (" + resp.error + ")");
      this._user['msg'] = resp.error;
      if (resp.error.match('Invalid / used nonce')) {
        this._user['msg'] += " Check your computer's clock. OAuth requires correct timestamp.";
      }
      EchofonUtils.log("Failed to get access token:" + req.responseText);
      this._target.onFailToGetAccessToken("Failed to login: " + resp.error, this);
      return;
    }

    else if (statusCode == 200) {
      var result = decodeURLParameter(req.responseText);
      EchofonUtils.log(req.responseText);
      this._user = result;
      EchofonUtils.log("Succeeded to get auth token for " + result.screen_name + ": " + result.oauth_token);
      this._target.onGetAccessToken(result);
    }
    else {
      EchofonUtils.log("Failed to get access token:" + req.responseText);
      this._target.onFailToGetAccessToken("Failed to get access token: " + req.status + " " + req.statusText);
    }
  },

  onError_GetAccessToken: function(req) {
    EchofonUtils.log("Failed to get access token");
    this._target.onFailToGetAccessToken("Failed to get access token");
  }
}
