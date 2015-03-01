//
// Copyright (c) 2011 Naoki Hiroshima / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonGA"];

let ACCOUNT   = 'UA-565580-23';
let DOWNLOAD_SOURCE = "mozilla";
const VERSION   = '4.9.1';
const GIF       = 'http://www.google-analytics.com/__utm.gif?';

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/Account.jsm");

var language, colorDepth, screenResolution;
var characterSet = 'UTF-8';
var javaEnabled = 1;
var flashVersion = '10.1 r102';
var pageTitle = 'Echofon'

var hostName, domainHash;
var utmhid = Math.floor(Math.random() * 0x7fffffff);

let appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
if (appInfo.name == "Echofon") {
  ACCOUNT   = 'UA-565580-25';
  hostName  = 'windows.echofon.com'
  domainHash = '116595200';
} else {
  hostName  = 'firefox.echofon.com'
  domainHash = '101498262';
}

function EchofonGA() {
  var localeService = Cc["@mozilla.org/intl/nslocaleservice;1"].getService(Ci.nsILocaleService);
  var screenManager = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);

  var left = {}, top = {}, width = {}, height = {};
  screenManager.primaryScreen.GetRect(left, top, width, height);

  screenResolution = width.value + 'x' + height.value;
  colorDepth = screenManager.primaryScreen.colorDepth + '-bit';
  language = localeService.getApplicationLocale().getCategory("NSILOCALE_CTYPE");


  var sess = EchofonUtils.pref().getCharPref("gasess");
  try {
    sess = JSON.parse(sess);
  }
  catch (e) {
    sess = {};
  }

  var now = +new Date();

  if (!sess.uuid) {
    var acct = EchofonAccountManager.instance().getPrimaryAccount();
    sess.uuid = acct ? acct : Math.floor(Math.random() * 0x7FFFFFFF);
  }
  if (!sess.initialVisit) {
    sess.initialVisit = now;
  }
  sess.previousSession = (sess.currentSession) ? sess.currentSession : now;
  sess.currentSession = now;
  this.sessCount = 1;
  this.sess = sess;
  EchofonUtils.pref().setCharPref("gasess", JSON.stringify(this.sess));

  this.referer = null;

  this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  let obj = this;
  this.timer.initWithCallback({notify: function() { obj.heartBeat();}}, 24 * 60 * 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);
  this.heartBeat();
}

EchofonGA.prototype = {

  sendRequest: function(url) {
    let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    request.open("GET", url, true);
    request.send(null)
  },

  trackPage: function(page) {
    var url = this.makeTrackingURL({'page':page, referer:this.referer});
    this.referer = page;
    this.sendRequest(url);
    return url;
  },

  trackEvent: function(category, action, label, value) {
    var event = '5('+category+'*'+action;
    if (label) event += '*'+label;
    if (value) event += ')('+value;
    event += ')';
    var url = this.makeTrackingURL({'event':event});
    this.sendRequest(url);
    return url;
  },

  heartBeat: function() {
    var pref = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch("extensions.twitternotifier.");
    this.trackEvent("app", "download source", DOWNLOAD_SOURCE, 0);
    if (pref.getBoolPref("login")) {
      this.trackEvent("app", "app mode (logged in)", pref.getCharPref("applicationMode"), 0);
    }
  },

  makeTrackingURL: function(params) {

    var utmcc = "__utma=" + domainHash +'.'+ this.sess.uuid +'.'+ this.sess.initialVisit +'.'+ this.sess.previousSession +'.'+ this.sess.currentSession +'.'+ this.sessCount++ + ";";

    var params_ = {
      'utmac':  ACCOUNT,
      'utmwv':  VERSION,
      'utmhn':  hostName,
      'utmcc':  utmcc,
      'utmul':  language,  // en-US
      'utmcs':  characterSet,  // iso-8859-1
      'utmsr':  screenResolution,  // 1680x1050
      'utmsc':  colorDepth,  // 24-bit
      'utmp':   '/',
      'utmr':   '-',
      'utmje':  javaEnabled,
      'utmfl':  flashVersion,
      'utmdt':  pageTitle,
      'utmn':   Math.floor(Math.random() * 0x7fffffff),
      'utmhid': utmhid
    };
    if (params['page']) {
      params_['utmp'] = params['page'];
      if (params['referer']) {
        params_['utmr'] = params['referer'];
      }
    }
    if (params['event']) {
      params_['utmt'] = 'event';
      params_['utme'] = params['event'];
      params_['utmr'] = 0;
    }

    var query = ''
    for (var i in params_) {
      query += i + '=' + encodeURIComponent(params_[i]) + '&';
    }
    return GIF + query;
  }

}

var gEchofonGA = null;

EchofonGA.instance = function() {
  if (gEchofonGA == null) {
    gEchofonGA = new EchofonGA();
  }
  return gEchofonGA;
}
