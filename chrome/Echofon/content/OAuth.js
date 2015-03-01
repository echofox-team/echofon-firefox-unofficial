
const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

Cu.import("resource://echofon/TwitterClient.jsm");
Cu.import("resource://echofon/Account.jsm");
Cu.import("resource://echofon/Models.jsm");

const DesktopOAuth = {
  onload: function() {
    var URI = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(window.location, null, null);
    var aURL = URI.QueryInterface(Ci.nsIURL);
    this.screen_name = aURL.query;
    var req = new TwitterClient({}, DesktopOAuth);
    req.requestToken();
  },

  onunload: function() {
    if (window.callback && window.callback.onOAuthWindowClosed)
      window.callback.onOAuthWindowClosed();
  },

  onGetRequestToken: function(req) {
    var statusCode = Number(req.status);

    if (statusCode == 200) {
      this.requestToken = req.responseText;
      var browser = document.getElementById('browser');
      browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
      browser.setAttribute('src', 'https://api.twitter.com/oauth/authorize?' + req.responseText + "&screen_name=" + this.screen_name + "&force_login=true");
    }
    else {
      alert(EchofonCommon.getString("FailedToGetOAuthToken"));
    }
  },

  onErrorRequestToken: function(req) {
    window.alert(EchofonCommon.getString("FailedToGetOAuthToken"));
  },

  onStateChange: function(progress, request, flag, status) {
    var channel;
    try {
      channel = request.QueryInterface(Components.interfaces.nsIHttpChannel);
    }
    catch (e) {
      return;
    }

    if (channel == null) return;

    if (flag & Ci.nsIWebProgressListener.STATE_START) {
      if (channel.URI.host == 'www.echofon.com') {
        this.verifyToken(channel);
        var browser = document.getElementById('browser');
        browser.stop();
      }
    }

    if(flag & Ci.nsIWebProgressListener.STATE_STOP &&
       flag & Ci.nsIWebProgressListener.STATE_IS_DOCUMENT) {

      if (channel.URI.path == '/oauth/authorize') {

        try {
          var browser = document.getElementById('browser');
          var elem = browser.contentDocument.getElementById("oauth_pin");
          var codes = elem.getElementsByTagName("code");
          if (codes.length) {
            elem = codes[0];
          }
          if (elem.innerHTML.match(/(\d+)/)) {
            document.getElementById("oauth-pin").value = RegExp.$1;
            let target = this;
            document.getElementById("spinner").setAttribute("hidden", false);
            document.getElementById("enter-button").setAttribute("disabled", true);
            Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer).
              initWithCallback({ notify: function() { target.onEnterOAuthPin(); }}, 300, Ci.nsITimer.TYPE_ONE_SHOT);
          }
        }
        catch (e) {
//          alert(EchofonCommon.getString("FailedToGetOAuthToken"));
        }
      }
    }
  },

  onEnterOAuthPin: function() {
    var pin = document.getElementById("oauth-pin").value;
    var params = decodeURLParameter(this.requestToken);
    params['oauth_verifier'] = pin;
    var tc = new TwitterClient({}, DesktopOAuth);
    tc.verifyToken(params);
  },

  verifyToken: function(channel) {
    var URL = channel.URI.QueryInterface(Ci.nsIURL);
    var queries = EchofonCommon.parseURLQuery(URL.query);

    var params = decodeURLParameter(this.requestToken);
    params['oauth_verifier'] = queries['oauth_verifier'];
    var tc = new TwitterClient({}, DesktopOAuth);
    tc.verifyToken(params);
  },

  onVerifyToken: function(request) {
    if (Number(request.status) == 200) {
      var mgr = EchofonAccountManager.instance();
      var account = mgr.add(decodeURLParameter(request.responseText));
      var req = new TwitterClient(account, DesktopOAuth);
      req.get('account.verify_credentials');
    }
    else {
      Cu.reportError("Failed to verify OAuth token: " + request.status + " (" + request.responseText + ")");
      alert(EchofonCommon.getString("FailedToGetOAuthToken"));
      window.close();
    }
  },

  onErrorVerifyToken: function(request) {
    alert(EchofonCommon.getString("FailedToGetOAuthToken"));
    window.close();
  },

  account_verify_credentials: function(resp, req, context) {
    if (resp) {
      var u = new EchofonModel.User(resp, context.user_id);
      u.insertIntoDB(true);
      if (window.callback)
        window.callback.onFinishOAuth(context.user_id);
      EchofonCommon.notifyObservers("updateAccountIcon");
    }
    else {
      alert("Failed to verify your account. Try later.");
    }
    window.close();
  },

  onLocationChange: function(aProgress, aRequest, URI) {
    this.URI = URI;
  },

  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) {},
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  QueryInterface: function (aIID) {
    if (aIID.equals(Components.interfaces.nsIWebProgressListener)   ||
        aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
        aIID.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_NOINTERFACE;
  }
};
