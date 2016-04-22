//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

var EXPORTED_SYMBOLS = ["EchofonUtils"];

Cu.import("resource://echofon/EchofonHttpRequest.jsm");

var ADDON_VERSION = '';
const LICENSE_SERVER = 'https://echofonads.appspot.com/license/';

function find_ext_callback(addon) {
  if (addon) {
    ADDON_VERSION = addon.version;
  }
  else {
    // for XUL Runner
    var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    return appInfo.version;
  }
}

const EchofonUtils = {
  _hasServerTimestamp: false,
  _timestampDiff: 0,

  notifyObservers: function(sts, obj, timeout) {

    try {
      var msg = {"state": sts, "data": obj};
      var data = JSON.stringify(msg);
      var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

      if (timeout) {
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback({notify: function() { obs.notifyObservers(null, "echofon-status", data)} },
                             timeout, Ci.nsITimer.TYPE_ONE_SHOT);
      }
      else {
        obs.notifyObservers(null, "echofon-status", data);
      }
    }
    catch (e) {
      this.dumpStackTrace();
      throw e;
    }
  },

  notifyComponents: function(command) {
    try {
      var p = {
        "command": command
      };

      if (arguments[1]) {
        for (var i in arguments[1]) {
          p[i] = arguments[1][i];
        }
      }
      var data = JSON.stringify(p);
      var obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
      obs.notifyObservers(null, "echofon-command", data);
    }
    catch (e) {
      this.dumpStackTrace();
      throw e;
    }
  },

  pref: function() {
    if (!this._pref) {
      this._pref = Components.classes['@mozilla.org/preferences-service;1']
        .getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitternotifier.");
    }
    return this._pref;
  },

  hasServerTimestamp: function() {
    return this._hasServerTimestamp;
  },

  timestampDiff: function() {
    return this._timestampDiff;
  },

  setTimestampDiff: function(diff) {
    this._hasServerTimestamp = true;
    this._timestampDiff = diff;
  },

  isActiveUser: function(token) {
    return (EchofonUtils.pref().getCharPref("activeUserId") == token.user_id) ? true : false;
  },

  setDelayTask: function(delay, target, func, data, type) {
    var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    if (type == null) {
      type = Ci.nsITimer.TYPE_ONE_SHOT;
    }
    timer.initWithCallback({notify: function() { target[func](data); } },
                           delay,
                           type);
    return timer;
  },

  isXULRunner: function() {
    if (!this.appInfo) {
      this.appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    }
    return (this.appInfo.name == "Echofon") ? true : false;
  },

  get_version: function() {
    if (ADDON_VERSION) return ADDON_VERSION;

    if (this.isXULRunner()) {
      var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
      return appInfo.version;
    }
    var guid = 'echofon-unofficial@echofox-team';
      try {
        var addon = Cc["@mozilla.org/extensions/manager;1"];
        ADDON_VERSION = addon.getService(Ci.nsIExtensionManager).getItemForID(guid).version;
      }
    catch (e) {
      Components.utils.import("resource://gre/modules/AddonManager.jsm");
      AddonManager.getAddonByID(guid, find_ext_callback);
    }
    return ADDON_VERSION;
  },

  verifyLicense: function(email, key, callback) {
    /*
    var r = new EchofonHttpRequest();
    var app = this.isXULRunner() ? "Echofon for Windows" : "Echofon for Firefox";
    r.setURL(LICENSE_SERVER + '?key=' + encodeURIComponent(key) + '&email=' + encodeURIComponent(email) + "&app=" + encodeURIComponent(app));
    r.onload  = function(p) {callback.onVerifyLicense(r);}
    r.asyncOpen();
    */
    var r = {};
    r.status = 200;
    callback.onVerifyLicense(r);
  },

  log: function(msg) {
    Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage(msg);
    dump(msg + "\n");
  },

  error: function(msg) {
    dump(msg + "\n");
    Components.utils.reportError(msg);
  },

  debug: function(msg) {
    if (this.pref().getBoolPref("debug")) {
      Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage(msg);
      dump(msg + "\n");
    }
  },

  dumpall: function(obj) {

    var space = '';
    if (arguments[1]) {
      space = arguments[1];
    }

    for (var i in obj) {
      if (typeof obj[i] == 'object') {
        dump(space + i + ":\n");
        this.dumpall(obj[i], space + '  ');
      }
      else if (typeof obj[i] != 'function') {
        dump(space + i + ": " + obj[i] + "\n");
      }
    }
  },

  dumpStackTrace: function() {
    if (!this.pref().getBoolPref("debug")) return;

    var callstack = [];
    try {
      i.dont.exist+=0; //doesn't exist- that's the point
    } catch(e) {
      if (e.stack) { //Firefox
        var lines = e.stack.split("\n");
        for (var i=0, len=lines.length; i<len; i++) {
          callstack.push(i + ':  ' + lines[i]);
        }
        //Remove call to printStackTrace()
        callstack.shift();
        callstack.pop();
      }
      dump('  --- stack trace---\n' + callstack.join('\n') + '\n  --- end of trace ---\n');
    }
  },

  readFile: function(path, filename) {
    const TWITTERFOX_UUID    = "echofon-unofficial@echofox-team";

    var manager = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager);
    var file = manager.getInstallLocation(TWITTERFOX_UUID).getItemLocation(TWITTERFOX_UUID);
    file.append(path);
    file.append(filename);

    var data = "";
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    fstream.init(file, -1, 0, 0);
    cstream.init(fstream, "UTF-8", 0, 0);

    var str = {};
    while (cstream.readString(4096, str) != 0) {
      data += str.value;
    }
    cstream.close();

    return data;
  }
};
