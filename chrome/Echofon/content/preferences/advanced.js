
var gAdvancedPane = {

  init: function() {
    this.initKeyboardShortcut();
    if (EchofonCommon.isXULRunner()) {
      document.getElementById("open-in-twitter").hidden = true;
      document.getElementById("keyboard-shortcut").hidden = true;
    }
  },

  // customizing keyboard shortcut
  initKeyboardShortcut: function() {

    this.localeKeys = document.getElementById("localeKeys");

    this.platformKeys = {};
    this.vkNames = {};

    var platformKeys = document.getElementById("platformKeys");
    this.platformKeys.shift   = platformKeys.getString("VK_SHIFT");
    this.platformKeys.meta    = platformKeys.getString("VK_META");
    this.platformKeys.alt     = platformKeys.getString("VK_ALT");
    this.platformKeys.control = platformKeys.getString("VK_CONTROL");
    this.platformKeys.sep     = platformKeys.getString("MODIFIER_SEPARATOR");

    var pref = Components.classes['@mozilla.org/preferences-service;1']
      .getService(Components.interfaces.nsIPrefService).getBranch("ui.key.");

    switch (pref.getIntPref("accelKey")) {
    case 17:
      this.platformKeys.accel = this.platformKeys.control;
      break;
    case 18:
      this.platformKeys.accel = this.platformKeys.alt;
      break;
    case 224:
      this.platformKeys.accel = this.platformKeys.meta;
      break;
    default:
      this.platformKeys.accel = (window.navigator.platform.search("Mac") == 0 ?
                                 this.platformKeys.meta : this.platformKeys.control);
    }

    for (var property in KeyEvent) {
      this.vkNames[KeyEvent[property]] = property.replace("DOM_","");
    }
    this.vkNames[8] = "VK_BACK";

    var keyconfig = ['togglePopup', 'insertURL'];

    for (var i in keyconfig) {
      var pref = EchofonCommon.pref().getCharPref(keyconfig[i]);
      var param = pref.split(/,/);
      var e = EchofonCommon.$("echofon-key-" + keyconfig[i]);
      e.value = this.getPrintableKeyName(param[2], param[0], param[1]);
      e.initialValue = e.pref = pref;
    }
  },

  recognize: function(e) {
    e.preventDefault();
    e.stopPropagation();

    var modifiers = [];
    if(e.altKey)   modifiers.push("alt");
    if(e.ctrlKey)  modifiers.push("control");
    if(e.metaKey)  modifiers.push("meta");
    if(e.shiftKey) modifiers.push("shift");

    modifiers = modifiers.join(" ");

    var key = "";
    var keycode = "";
    if(e.charCode) {
      key = String.fromCharCode(e.charCode).toUpperCase();
    }
    else {
      keycode = this.vkNames[e.keyCode];
      if(!keycode) return;
    }

    var val = this.getPrintableKeyName(modifiers, key, keycode);
    if (val) {
      e.target.value = val;
      this.setKeyboardShortcut(e.target.id, key, keycode, modifiers);
    }
  },

  revert: function(e) {
    var target = e.target.previousSibling;
    var param = target.initialValue.split(/,/);
    target.value = this.getPrintableKeyName(param[2], param[0], param[1]);
    this.setKeyboardShortcut(target.id, param[0], param[1], param[2]);
  },

  setKeyboardShortcut: function(id, key, keycode, modifiers) {
    var prefkey = id.split(/-/)[2];
    EchofonCommon.pref().setCharPref(prefkey, key + "," + keycode + "," + modifiers);
  },

  getPrintableKeyName: function(modifiers,key,keycode) {
    if(modifiers == "shift,alt,control,accel" && keycode == "VK_SCROLL_LOCK") return "";

    if (!modifiers && !keycode)
      return "";

    var val = "";
    if(modifiers) {
      val = modifiers.replace(/^[\s,]+|[\s,]+$/g,"").split(/[\s,]+/g).join(this.platformKeys.sep);
    }

    var   mod = ["alt", "shift", "control", "meta", "accel"];
    for (var i in mod) {
      val = val.replace(mod[i], this.platformKeys[mod[i]]);
    }

    if (val)
      val += this.platformKeys.sep;

    if(key) {
      val += key;
    }
    if(keycode) {
      try {
        val += this.localeKeys.getString(keycode);
      }
      catch(e) {
        val += keycode;
      }
    }

    return val;
  },

  clearCache: function() {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    var result = prompt.confirm(window, "Echofon", EchofonCommon.getString("ConfirmClearCache"));
    if (!result) return;

    EchofonCommon.pref().setBoolPref("clearDB", true);

    var flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING +
                prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_IS_STRING;
    var check = {value: false};
    var apptype = EchofonCommon.isXULRunner() ? "Echofon" : "Firefox";
    var button = prompt.confirmEx(window, "Echofon", EchofonCommon.getFormattedString("WarnClearCache", [apptype]), flags,
                                  EchofonCommon.getString("RestartNow"),
                                  EchofonCommon.getString("RestartLater"),
                                  "", null, check);
    if (button == 0) {
      var boot = Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(Components.interfaces.nsIAppStartup);
      boot.quit(Components.interfaces.nsIAppStartup.eForceQuit|Components.interfaces.nsIAppStartup.eRestart);
    }
  }
};