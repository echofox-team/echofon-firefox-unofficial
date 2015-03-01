//
// Implementation of user streams client
//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["UserStreams"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;
const CONNECTION_ESTABLISH_TIMEOUT = 25 * 1000;
const USER_STREAMS_TIMEOUT = 90 * 1000;

Components.utils.import("resource://echofon/EchofonUtils.jsm");

function UserStreams() {
  this.wrappedJSObject = true;
  this.responseText = "";
  this.status = 0;
  this.retryCount = 0;
  this.retryInterval = 0;

  var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  observer.addObserver(this, "http-on-modify-request", false);
  observer.addObserver(this, "http-on-examine-response", false);
  observer.addObserver(this, "quit-application-granted", false);
  Components.utils.import("resource://echofon/xpcerror.jsm");
}

UserStreams.prototype = {

  httpChannel: function() {
    return this.channel.QueryInterface(Ci.nsIHttpChannel);
  },

  setURL: function(url) {
    this.requestURL = url;
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var URI = ioService.newURI(url, null, null);
    this.URI = URI;

    this.channel = ioService.newChannelFromURI(URI);
    this.httpChannel().redirectionLimit = 2;
  },

  resetTimeout: function(time) {
    var target = this;
    if (this._timer) {
      this._timer.cancel();
    }
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(
      {
        notify: function() {
          try {
            target.channel.cancel(Components.results.NS_BINDING_ABORTED);
          }
          catch (e) {}

          target["onerror"]("timeout: " + time + "s");
        }
      },
      time,
      Ci.nsITimer.TYPE_ONE_SHOT);
  },

  asyncOpen: function() {
    this.channel.notificationCallbacks = this;
    this.channel.asyncOpen(this, null);
    this.resetTimeout(CONNECTION_ESTABLISH_TIMEOUT);
  },

  setPostData: function(data) {
    var upStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
    upStream.setData(data, data.length);
    var upChannel = this.channel.QueryInterface(Ci.nsIUploadChannel);
    upChannel.setUploadStream(upStream, "application/x-www-form-urlencoded", -1);

    this.httpChannel().requestMethod = "POST";
  },

  setRequestHeader: function(header, param) {
    this.httpChannel().setRequestHeader(header, param, true);
  },

  getResponseHeader: function(header) {
    return this.httpChannel().getResponseHeader(header);
  },

  setOAuthHeader: function(header) {
    this.oauth_header = header;
  },

  abort: function() {
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
    try {
      this.channel.cancel(Components.results.NS_BINDING_ABORTED);
    }
    catch (e) {}
  },

  onStartRequest: function(request, context) {
    this.resetTimeout(USER_STREAMS_TIMEOUT);
    this.responseText = "";
    try {
      this.status = this.httpChannel().responseStatus;
      this.statusText = this.httpChannel().responseStatusText;
    }
    catch (e) {}
    EchofonUtils.debug("Connected to User Streams Server: " + this.status + " " + this.statusText);
  },

  onDataAvailable: function(request, context, stream, offset, length) {
    var bstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    bstream.setInputStream(stream);

    this.resetTimeout(USER_STREAMS_TIMEOUT);

    var chunk = bstream.readByteArray(bstream.available());
    while (chunk[0] == 0x0d || chunk[0] == 0x0a) {
      chunk.splice(0,1);
    }
    var resp = String.fromCharCode.apply(null, chunk);

    if (resp.match(/^[\r\n]+$/)) {
      return;
    }

    this.responseText += resp;
    if (chunk.indexOf(0x0d) >= 0) {
      this.onstream();
    }
  },

  onStopRequest: function(request, context, status) {
    var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    observer.removeObserver(this, "http-on-modify-request");
    observer.removeObserver(this, "http-on-examine-response");
    observer.removeObserver(this, "quit-application-granted");

    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }

    if (status == Components.results.NS_BINDING_ABORTED) {
//      Components.utils.reportError("User Stream Connection aborted");
      return;
    }

    var event = {};
    if (Components.isSuccessCode(status)) {
      if (this.onstop) {
        this.onstop();
      }
    }
    else {
      if (this.onerror) {
        if (this.responseText == "") {
          var resp = {error:"Failed to load (" + stringForXPCError[status] + ")",
                      request:this.requestURL};
          this.responseText = JSON.stringify(resp);
        }
        this.onerror(stringForXPCError(status));
      }
      else {
        Components.utils.reportError("Failed to load " + this.requestURL.replace(/\?.*/, '') + " (" + stringForXPCError(status) + ")");
      }
    }
  },

  onChannelRedirect: function(oldChannel, newChannel, flags) {
    this.channel = newChannel;
  },

  observe: function(subject, topic, data) {
    // Do not use user cookies
    //
    if (subject == this.channel) {
      if (topic == "http-on-modify-request") {
        this.httpChannel().setRequestHeader("Cookie", "", false);
        this.httpChannel().setRequestHeader("X-User-Agent", "Echofon Firefox " + EchofonUtils.get_version(), false);
        this.httpChannel().setRequestHeader("Authorization", "OAuth " + this.oauth_header, false);
      }
      else if (topic == "http-on-examine-response") {
        this.httpChannel().setResponseHeader("Set-Cookie", "", false);
      }
    }
    if (topic == "quit-application-granted") {
      this.abort();
    }
  },

  getInterface: function(aIID) {
    try {
      return this.QueryInterface(aIID);
    }
    catch (e) {
      throw Components.results.NS_NOINTERFACE;
    }
  },

  // nsIProgressEventSink (to shut up annoying debug exceptions
  onProgress: function(request, context, progress, progressmax) {},
  onStatus: function(request, context, status, statusArg) {},

  // nsIHttpEventSink (to shut up annoying debug exceptions
  onRedirect: function(oldChannel, newChannel) {},

  // nsIAuthPromptProvider (to shut up annoying debug exceptions
  getAuthPrompt: function(reason) {},

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
};
