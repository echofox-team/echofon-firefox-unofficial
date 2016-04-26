//
// Implementation of Echofon account manager
//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonAccountManager"];


var gEchofonAccountManager = null;

function EchofonAccountManager()
{
  this.pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitternotifier.");
  try {
    this.accounts = JSON.parse(this.pref.getCharPref("accounts"));
  }
  catch (e) {
    this.accounts = {};
    this.pref.setCharPref("accounts", "{}");
  }
}

EchofonAccountManager.prototype = {
  allAccounts: function() {
    return this.accounts;
  },

  numAccounts: function() {
    var n = 0;
    for (var i in this.accounts) {
      ++n;
    }
    return n;
  },

  getPrimaryAccount: function() {
    for (var i in this.accounts) {
      return i;
    }
    return 0;
  },

  get: function(user_id) {
    var acct = null
    if (user_id) {
      acct = this.accounts[user_id];
    }
    else {
      acct = this.accounts[this.pref.getCharPref("activeUserIdStr")];
    }
    if (acct) {
      this.addMethods(acct);
    }
    return acct;
  },

  add: function(acct) {
    this.accounts[acct.user_id] = acct;
    this.addMethods(acct);
    this.save();
    return acct;
  },

  remove: function(user_id) {
    delete this.accounts[user_id];
    this.save();
  },

  save: function() {
    try {
      var val = JSON.stringify(this.accounts);
      if (val) {
        this.pref.setCharPref("accounts", val);
      }
    }
    catch (e) {
      Components.utils.reportError("Failed to save account info: " + e.message);
    }
  },

  addMethods: function(acct) {
    acct.setValue = function(name, value) {
      this[name] = value;
    }
    acct.needToAlertOAuthError = function() {
      val = this['oauth_error_count'];
      if (!val) val = 0;
      ++val;
      var ret = (val >= 2) ? true : false;
      this['oauth_error_count'] = val;
      Components.utils.reportError("Failed to OAuth (retry count = " + val + ")");
      this.save();
      return ret;
    }
    acct.clearOAuthError = function() {
        this['oauth_error_count'] = 0;
        this.save();
    },

    acct.save = function() {
      gEchofonAccountManager.save();
    }
    acct.destroy = function() {
      gEchofonAccountManager.removeAccount(this.user_id);
    }
  }
};

EchofonAccountManager.instance = function() {
  if (gEchofonAccountManager == null) {
    gEchofonAccountManager = new EchofonAccountManager();
  }
  return gEchofonAccountManager;
}
