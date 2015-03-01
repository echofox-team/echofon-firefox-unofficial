
var gGeneralPane = {
  init: function() {
    this.onChangePopup(EchofonCommon.pref().getBoolPref('popup'));

    if (!EchofonCommon.isFF4() && navigator.platform.match("Linux")) {
      var elem = document.getElementById("app-mode-panel");
      elem.disabled = true;
      elem.setAttribute("tooltiptext", "Panel mode doesn't work on this platform");
    }
    if (EchofonCommon.isXULRunner()) {
      document.getElementById("popup-group").hidden = true;
      document.getElementById("notification-group").hidden = true;
      document.getElementById("open-link").hidden = true;
      document.getElementById("application-mode-group").hidden = true;
    }

    document.getElementById("unread-count").checked = EchofonCommon.pref().getBoolPref("unreadCount");

    var playSound = EchofonCommon.pref().getBoolPref("sound");
    document.getElementById("sound").checked = playSound;
    document.getElementById("sound-file").value = EchofonCommon.pref().getCharPref("soundFile");
    document.getElementById("sound-file").disabled = !playSound;
    document.getElementById("choose-sound").disabled = !playSound;

    var menulist = document.getElementById("font-face");
    var langGroupPref = document.getElementById("font.language.group");
    FontBuilder.buildFontList(langGroupPref.value, "", menulist);
    menulist.insertItemAt(0, "System Default", "", "");
    menulist.selectedIndex = 0;
    var currentFace = EchofonCommon.pref().getCharPref("fontFace");
    for (var i in menulist.menupopup.childNodes) {
      var item = menulist.menupopup.childNodes[i];
      if (item.value == currentFace) {
        menulist.selectedIndex = i;
        break;
      }
    }
  },

  onChangeAppMode: function(menu) {
    EchofonCommon.notifyObservers("closeWindow");
    EchofonCommon.pref().setCharPref("applicationMode", menu.selectedItem.value);
    EchofonCommon.notifyObservers("toggleWindow");
    window.focus();
  },

  onChangeFont: function() {
    Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).
      initWithCallback({notify: function() { EchofonCommon.notifyObservers("updateFont") }}, 50, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  },

  onChangePopup: function(checked) {
    document.getElementById('popup-interval').disabled = !checked;
    document.getElementById('limited-popup').disabled = !checked;
    document.getElementById('limited-popup2').disabled = !checked;
  },

  onCheckUnreadCount: function(flag) {
    EchofonCommon.notifyObservers("showUnreadCount", !flag);
  },

  // Sound notitications
  onCheckSound: function(flag) {
    document.getElementById('sound-file').disabled = flag;
    document.getElementById('choose-sound').disabled = flag;
  },

  onBrowseFile: function() {
    const nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, EchofonCommon.getString("ChooseSoundFile"), nsIFilePicker.modeOpen);
    if (navigator.platform == "MacPPC" ||
        navigator.platform == "MacIntel") {
      fp.appendFilter(EchofonCommon.getString("SoundFileFilter") + " (*.wav, *.aiff)" , "*.wav; *.aiff; *.aif");
    }
    else {
      fp.appendFilter(EchofonCommon.getString("SoundFileFilter") + " (*.wav)", "*.wav");
    }

    var ret = fp.show();
    if (ret == nsIFilePicker.returnOK || ret == nsIFilePicker.returnReplace) {
      var file = fp.file;
      EchofonCommon.pref().setCharPref("soundFile", file.path);
      document.getElementById("sound-file").value = file.path;
    }
  }

};