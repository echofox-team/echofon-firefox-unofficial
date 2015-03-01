//
// bit.ly client
//
// Copyright (c) 2009-2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["Bitly"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

const BITLY_API_URL = "http://api.bit.ly/v3/"
const BITLY_LOGIN   = "naan";
const BITLY_API_KEY = "R_8d00682092eaa921181523f6c04c45d4";

Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/EchofonHttpRequest.jsm");

var gDecodedTinyURLs = [];

function Bitly(target, callback)
{
  this.target = target;
  this.callback = callback;
  this.status = 0;
  this.error = null;
}

Bitly.prototype = {
  //
  // shorten
  //
  shorten: function(url) {
    this.longURL = url;

    var requestURL = BITLY_API_URL + "shorten?login=" + BITLY_LOGIN + "&apiKey=" + BITLY_API_KEY + "&longUrl=" + encodeURIComponent(url);
    var req = new EchofonHttpRequest();
    req.setURL(requestURL);
    var target = this;
    req.onload    = function() {target.onLoadShorten(req)};
    req.onerror   = function() {target.onErrorShorten()};

    req.asyncOpen();
  },

  onLoadShorten: function(req) {
    this.status = req.status;
    try {
      var data = JSON.parse(req.responseText);
      this.shortenURL = data['data']['url'];
      if (data.status_code != 200) {
        this.error = data.status_txt;
      }
    }
    catch (e) {
      this.error = "Unknown error on shorten URL with bit.ly";
    }
    if (this.callback) {
      this.target[this.callback](this);
    }
  },

  onErrorShorten: function(e) {
    this.error = "Failed to shorten URL (Unknown error occurred)";
    this.status = Components.lastResult;
    if (this.callback) {
      this.target[this.callback](this);
    }
  }
}


//
// Expand
//
Bitly.getDecodedTinyURL = function(link, messageId) {
  if (gDecodedTinyURLs[link]) {
    return gDecodedTinyURLs[link];
  }
  else {
    var target = this;
    var req = new EchofonHttpRequest();

    req.setURL(link);
    req.setRedirectLimitation(0);
    req.onerror = function(e) {
      var loc = req.httpChannel().getResponseHeader("Location");
      gDecodedTinyURLs[link] = loc;
      EchofonUtils.notifyObservers("shortenURLDidExpand", {url:loc, originalURL:link, messageId:messageId});
    }
    req.asyncOpen();
    return link;
  }
}
