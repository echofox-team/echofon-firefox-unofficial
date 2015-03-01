//
//
//
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const PURCHASE_SERVER = 'https://echofonads.appspot.com/purchase/';

Cu.import("resource://echofon/EchofonUtils.jsm");

const Purchase = {
  onload: function() {
    var browser = document.getElementById('browser');
    browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    var path = EchofonUtils.isXULRunner() ? "windows" : "firefox";
    browser.setAttribute('src', PURCHASE_SERVER + path);
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

    if(flag & Ci.nsIWebProgressListener.STATE_STOP &&
       flag & Ci.nsIWebProgressListener.STATE_IS_DOCUMENT) {

      if (channel.URI.path.match('/checkout/complete.*') ||
          channel.URI.path == '/paypal/checkout') {

        var browser = document.getElementById('browser');
        var key = browser.contentDocument.getElementById("license_key");
        var email = browser.contentDocument.getElementById("license_to");

        document.getElementById("license_email").value = email.getAttribute("value");
        document.getElementById("license_key").value = key.getAttribute("value");
        document.getElementById("enter-button").setAttribute("disabled", false);
      }
    }
  },

  enterText: function() {
    var email = document.getElementById("license_email").value;
    var key = document.getElementById("license_key").value;
    if (email.length && key.length) {
      document.getElementById("enter-button").setAttribute("disabled", false);
    }
    else {
      document.getElementById("enter-button").setAttribute("disabled", true);
    }
  },

  onEnterLicenseKey: function() {
    var email = document.getElementById("license_email").value;
    var key = document.getElementById("license_key").value;
    document.getElementById("spinner").setAttribute("src", "chrome://echofon/content/images/load-more-user-view.gif");
    document.getElementById("enter-button").setAttribute("disabled", true);

    var callback = this;
    EchofonUtils.verifyLicense(email, key, callback);
    //verify key here
  },

  onVerifyLicense: function(r) {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    switch(parseInt(r.status)) {
      case 200:
        prompt.alert(null, "Echofon", "Your license key has been verified!");
        EchofonCommon.notify("removeAds", {email:document.getElementById("license_email").value,
                                           key:document.getElementById("license_key").value});
        window.close();
        return;

      default:
        resp = JSON.parse(r.responseText);
        prompt.alert(null, "Failed to verify the license key", resp.error);
        break;
    }
    document.getElementById("spinner").setAttribute("src", "");
    document.getElementById("enter-button").setAttribute("disabled", false);
  },

  onErrorVerifyLicense: function(r) {
    resp = JSON.parse(r.responseText);
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    prompt.alert(null, "Failed to verify the license key", resp.error);

    document.getElementById("spinner").setAttribute("src", "");
    document.getElementById("enter-button").setAttribute("disabled", false);
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
