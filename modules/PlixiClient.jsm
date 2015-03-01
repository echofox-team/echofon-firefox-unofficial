//
// Implementation of Plixi client
//
// Copyright (c) 2011 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["PlixiClient"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

const OAUTH_ECHO_PROVIDER = "https://api.twitter.com/1/account/verify_credentials.json";
const PLIXI_API_URL = "http://api.plixi.com/api/tpapi.svc/json/upload2";
const PLIXI_API_KEY = "50483493-2f21-48e0-b3fb-bc06b631b6dc";

const mimeTypes = {"jpg":"image/jpeg",
                   "jpeg":"image/jpeg",
                   "png":"image/png"};

Cu.import("resource://echofon/TwitterClient.jsm");
Cu.import("resource://echofon/EchofonUtils.jsm");

function PlixiClient(user, target, context)
{
  this.user = user;
  this.target = target;
  this.context = context;
}

PlixiClient.prototype = {
  upload: function(file_path, text, location) {
    this.file_path = file_path;
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithPath(file_path);

    var ext = file.leafName.split('.').pop();
    var mimeType = mimeTypes[ext];

    var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    req.open("POST", PLIXI_API_URL);
    var target = this;
    req.onload    = function(p) {target.onLoad(req);}
    req.onerror   = function(p) {target.onError(req);}

    req.setRequestHeader("Content-length", file.fileSize);
    req.setRequestHeader("TPSERVICE", "Twitter");
    req.setRequestHeader("TPISOAUTH", "True");
    req.setRequestHeader("TPAPIKEY", PLIXI_API_KEY);
    req.setRequestHeader("TPMIMETYPE", mimeType);
    req.setRequestHeader("TPUTF8", "True");
    req.setRequestHeader("TPMSG", btoa(text));

    var oauthecho = TwitterClient.buildOAuthHeader(this.user, "GET", OAUTH_ECHO_PROVIDER, {});
    req.setRequestHeader("X-Verify-Credentials-Authorization", "OAuth " + oauthecho);
    req.setRequestHeader("X-Auth-Service-Provider", OAUTH_ECHO_PROVIDER);

    if (location) {
      req.setRequestHeader("TPLAT", location.latitude);
      req.setRequestHeader("TPLONG", location.longitude);
    }

    var stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    stream.init(file.nsIFile, 1, 1, stream.CLOSE_ON_EOF);

    req.send(stream);
    return req;
  },

  onLoad: function(req) {
    var resp = JSON.parse(req.responseText);
    switch (Number(req.status)) {
      case 201:
        this.target.imageUploadDidFinish(this.context, this.file_path, resp["MediaUrl"]);
        break;

      default:
        Cu.reportError("Failed to upload image: " + resp['Error']['ErrorCode'] + ": " + resp['Error']['Message']);
        this.context.error = "Failed to upload image: " + resp['Error']['Message'];
        EchofonUtils.notifyObservers("failedToSendMessage", this.context);
        break;
    }
  },

  onError: function(req) {
    this.context.error = "Failed to upload image: network error";
    Cu.reportError(this.context.error);
    EchofonUtils.notifyObservers("failedToSendMessage", this.context);
  }
}
