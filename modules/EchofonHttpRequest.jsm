//
// Implementation of Echofon network client
//
// Copyright (c) 2009 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonHttpRequest"];

const {classes:Cc, interfaces:Ci} = Components;

//
// Utility functions
//
var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

var allHeaders = "";

function visitHeader(header, value) {
  allHeaders += (header + ": " + value + "\n");
}

function toUTF8Octets(string) {
  return unescape(encodeURIComponent(string));
}

function btoa(input) {
  var output = "";
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;

  do {
    chr1 = input.charCodeAt(i++);
    chr2 = input.charCodeAt(i++);
    chr3 = input.charCodeAt(i++);

    enc1 = chr1 >> 2;
    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }

    output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) +
      keyStr.charAt(enc3) + keyStr.charAt(enc4);
  } while (i < input.length);

  return output;
}

//
// Custom HTTP request
//
function EchofonHttpRequest() {
  this.wrappedJSObject = true;
  this.responseText = "";
  this.status = 0;

  var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  observer.addObserver(this, "http-on-modify-request", false);
  observer.addObserver(this, "http-on-examine-response", false);
  observer.addObserver(this, "quit-application-granted", false);
  Components.utils.import("resource://echofon/xpcerror.jsm");
  Components.utils.import("resource://echofon/EchofonUtils.jsm");
}

EchofonHttpRequest.prototype = {

  httpChannel: function() {
    return this.channel.QueryInterface(Ci.nsIHttpChannel);
  },

  setURL: function(url) {
    if (url.match(/^www\./)) {
      url = "http://" + url;
    }
    this.requestURL = url;
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var URI = ioService.newURI(url, null, null);
    this.URI = URI;

    this.channel = ioService.newChannelFromURI(URI);
  },

  setRedirectLimitation: function(num) {
    this.httpChannel().redirectionLimit = num;
  },

  setTimeout: function(msec) {
    var target = this;
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback({
      notify: function() {
          target["onTimeout"]();
        }
      },
      msec,
      Ci.nsITimer.TYPE_ONE_SHOT);

  },

  asyncOpen: function() {
    this.channel.notificationCallbacks = this;
    this.channel.asyncOpen(this, null);
  },

  open: function() {
    this.channel.open();
  },

  setPostData: function(data) {
    var upStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
    if (data.length == 0) {
      upStream.setData("", 1);
    }
    else {
      upStream.setData(data, data.length);
    }
    var upChannel = this.channel.QueryInterface(Ci.nsIUploadChannel);
    upChannel.setUploadStream(upStream, "application/x-www-form-urlencoded", -1);

    this.httpChannel().requestMethod = "POST";
  },

  getRequestHeader: function(header) {
    return this.httpChannel().getRequestHeader(header);
  },

  setRequestHeader: function(header, param) {
    this.httpChannel().setRequestHeader(header, param, true);
  },

  getResponseHeader: function(header) {
    try {
      return this.httpChannel().getResponseHeader(header);
    }
    catch (e) {
      return "";
    }
  },

  getAllRequestHeaders: function() {
    allHeaders = "";
    this.httpChannel().visitRequestHeaders(visitHeader);
    return allHeaders;
  },

  getAllResponseHeaders: function() {
    allHeaders = "";
    this.httpChannel().visitResponseHeaders(visitHeader);
    return allHeaders;
  },

  setBasicAuth: function(user, pass) {
    this.user = user;
    this.pass = pass;
  },

  setOAuthHeader: function(header) {
    this.oauth_header = header;
  },

  abort: function() {
    if (this.timer) {
      this.timer.cancel();
    }
    try {
      this.cannnel.notificationCallbacks = null;
      this.channel.cancel(Components.results.NS_BINDING_ABORTED);
      this.cannnel = null;
    }
    catch (e) {}
  },

  onStartRequest: function(request, context) {
    if (this.channel == null) return;
    this.responseText = "";
    try {
      this.status = this.httpChannel().responseStatus;
      this.statusText = this.httpChannel().responseStatusText;
    }
    catch (e) {}
  },

  onDataAvailable: function(request, context, stream, offset, length) {
    if (this.channel == null) return;
    var scriptableInputStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
    scriptableInputStream.init(stream);

    this.responseText += scriptableInputStream.read(length);
  },

  onStopRequest: function(request, context, status) {

    var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    observer.removeObserver(this, "http-on-modify-request");
    observer.removeObserver(this, "http-on-examine-response");
    observer.removeObserver(this, "quit-application-granted");
    if (this.channel == null) return;

    if (this._timer) {
      this._timer.cancel();
    }

    if (status  == Components.results.NS_BINDING_ABORTED) {
      return;
    }

    var event = {};
    if (Components.isSuccessCode(status)) {
      if (this.onload) {
        this.onload(event);
      }
    }
    else if (status != Components.results.NS_BINDING_ABORTED) {
      if (this.onerror) {
        if (this.responseText == "") {
          var resp = {error:"Failed to load (" + stringForXPCError(status) + ")",
                      status:status,
                      request:this.requestURL};
          this.responseText = JSON.stringify(resp);
        }
        this.onerror(event);
      }
      else {
        Components.utils.reportError("Failed to load " + this.requestURL.replace(/\?.*/, '') + " (" + stringForXPCError(status) + ")");
      }
    }
  },

  onChannelRedirect: function(oldChannel, newChannel, flags) {
    this.channel = newChannel;
  },

  onTimeout: function () {
    if (this.ontimeout) {
      var event = {};
      if (this.responseText == "") {
          var resp = {error:"Network timeout",
                      request:this.requestURL};
          this.responseText = JSON.stringify(resp);
      }
      this.ontimeout(event);
    }
    else {
      Components.utils.reportError("Connection timeout: " + this.requestURL.replace(/\?.*/, ''));
    }
  },

  observe: function(subject, topic, data) {
    if (subject == this.channel) {
      if (topic == "http-on-modify-request") {
        var channel = this.httpChannel();
        // Do not use user's cookies
        //
        channel.setRequestHeader("Cookie", "", false);
        var app = EchofonUtils.isXULRunner() ? "Windows" : "Firefox";
        var userAgent = "Echofon " + app + " " + EchofonUtils.get_version();
        channel.setRequestHeader("X-User-Agent", userAgent, false);

        // Modify authrentication header
        //
        if (this.user) {
          channel.setRequestHeader("Authorization", "Basic " + btoa(toUTF8Octets(this.user + ":" + this.pass)), false);
        }
        else if (this.oauth_header) {
          channel.setRequestHeader("Authorization", "OAuth " + this.oauth_header, false);
        }
      }
      else if (topic == "http-on-examine-response") {
        this.httpChannel().setResponseHeader("Set-Cookie", "", false);
      }
    }
    if (topic == "quit-application-granted") {
      this.abort();
    }
  },

  // nsIInterfaceRequestor
  getInterface: function(aIID) {
    try {
      return this.QueryInterface(aIID);
    }
    catch (e) {
      throw Components.results.NS_NOINTERFACE;
    }
  },

  // nsIProgressEventSink (to shut up annoying debug exceptions)
  onProgress: function(request, context, progress, progressmax) {},
  onStatus: function(request, context, status, statusArg) {},

  // nsIHttpEventSink (to shut up annoying debug exceptions)
  onRedirect: function(oldChannel, newChannel) {},
  asyncOnChannelRedirect: function(oldChannel, newChannel, aFlag, aCallback) {},

  // nsIAuthPromptProvider (to shut up annoying debug exceptions)
  getAuthPrompt: function(reason, iid, result) {
    if (reason == 1) {
      return Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIPromptFactory).getPrompt(null, iid);
    }
    return null;
  },

  QueryInterface: function(aIID) {
    if (aIID.equals(Ci.nsISupports) ||
        aIID.equals(Ci.nsIObserver) ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsIWebProgress) ||
        aIID.equals(Ci.nsIDocShell) ||
        aIID.equals(Ci.nsIDocShellTreeItem) ||
        aIID.equals(Ci.nsIPrompt) ||
        aIID.equals(Ci.nsIAuthPrompt) ||
        aIID.equals(Ci.nsIAuthPromptProvider) ||
        aIID.equals(Ci.nsIInterfaceRequestor) ||
        aIID.equals(Ci.nsIChannelEventSink) ||
        aIID.equals(Ci.nsIProgressEventSink) ||
        aIID.equals(Ci.nsIHttpEventSink) ||
        aIID.equals(Ci.nsIStreamListener))
      return this;

    throw Components.results.NS_NOINTERFACE;
  }
}
