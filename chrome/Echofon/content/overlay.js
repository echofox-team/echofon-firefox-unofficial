//
// Implementation of Echofon browser overlay
//
// Copyright (c) 2007-2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

if (typeof EchofonOverlay == 'undefined') {

var EchofonOverlay = {

  _messageQueue: new Array(),
  _hasFocus: false,
  _focusInText: false,
  _askedToReAuth: false,

  //
  // event handlers
  //
  load: function() {
    Components.utils.import("resource://echofon/Account.jsm");

    // Don't init overlay if the browser window is popup.
    if (window.toolbar.visible == false) {
      var btn = this.$("echofon-statusbar-button");;
      var parent = btn.parentNode;
      parent.removeChild(btn);
      return;
    }
    let obj = this;
    Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer)
      .initWithCallback({notify: function() {obj.delayInit()}}, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  },

  delayInit: function() {
    this._sound = Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);

    EchofonCommon.initKeyConfig();

    var pref = EchofonCommon.pref();

    if (navigator.platform.match("Linux")/* && !EchofonCommon.isFF4()*/) {
      pref.setBoolPref("dontPopupWhileTyping", true);
    }
    else {
      pref.setBoolPref("dontPopupWhileTyping", false);
    }

    var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    let obj = this;
    observer.addObserver(obj, "echofon-status", false);
    observer.addObserver(obj, "quit-application-granted", false);

    EchofonCommon.notify("init");

    document.getElementById("content").addProgressListener(this.EchofonProgressListener);

    if (!pref.getBoolPref("toolbarButtonAdded")) {
      var id = "echofon-toolbar-button";
      var navbar = this.$("nav-bar");
      if (navbar){
        var curSet = navbar.currentSet;
        if (curSet.indexOf( id ) == -1) {
          var set = curSet + "," + id;
          navbar.setAttribute("currentset", set);
          navbar.currentSet = set;
          document.persist("nav-bar", "currentset");
    }
      }
      pref.setBoolPref("toolbarButtonAdded", true);
    }
    if (pref.getBoolPref("openWindowAtLaunch") && pref.getCharPref("applicationMode") == "window" && pref.getBoolPref("login")) {
      var win = this.echofonMainWindow();
      if (!win) {
        this.openWindow();
      }
    }
    if (!EchofonCommon.isFF4()) {
      // No panel mode on Linux
      if (navigator.platform.match("Linux") && pref.getCharPref("applicationMode") == "panel") {
        pref.setCharPref("applicationMode", "window");
      }
      else {
    var popup = this.$('echofon-window-popup');
    popup.setAttribute("FF3", "true");
    var compose = document.createElement('echofon-compose');
    compose.id = 'echofon-compose-bar';
    popup.appendChild(compose);
    compose.setAttribute("sidebar", "true");
      }
    }

    var toolbar = this.$('echofon-toolbar-button');
    if (toolbar) {
      var menupopup = this.$('echofon-main-menupopup');
      var clone = menupopup.cloneNode(true);
      clone.id = 'echofon-main-menupopup-clone';
      toolbar.appendChild(clone);
    }

    // Display splash screen if this is the first time of launch and no accounts information stored.
    //
    if (pref.getBoolPref("splashScreen")) {
      Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).
        initWithCallback({notify: function() {
          if (EchofonCommon.pref().getBoolPref("splashScreen")) {
            var accounts = EchofonCommon.pref().getCharPref("accounts");
            if (accounts == "{}") {
              EchofonCommon.openURL("chrome://echofon/content/welcome.xul", null, true);
            }
            EchofonCommon.pref().setBoolPref("splashScreen", false);
          }
    }
      }, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    }
  },

  unload: function() {
    if (window.toolbar.visible == false) return;

    var observer = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    let obj = this;
    observer.removeObserver(obj, "echofon-status");
    observer.removeObserver(obj, "quit-application-granted");

    document.getElementById("content").removeProgressListener(this.EchofonProgressListener);
  },

  focus: function(event) {
    if (event.originalTarget.tagName) {
      if (event.originalTarget.tagName.toLowerCase() == "input" || event.originalTarget.tagName.toLowerCase() == "textare" || event.originalTarget.tagName.toLowerCase() == "html:input") {
        this._focusInText = true;
      }
    }
  },

  blur: function(event) {
    if (event.originalTarget.tagName) {
      if (event.originalTarget.tagName.toLowerCase() == "input" || event.originalTarget.tagName.toLowerCase() == "textare" || event.originalTarget.tagName.toLowerCase() == "html:input") {
        this._focusInText = false;
      }
    }
  },

  activate: function (e) {
    this._hasFocus = true;
  },

  deactivate: function (e) {
    this._hasFocus = false;
  },

  openPanel: function() {
    var p = this.$('echofon-window-popup');
    if (p.state == 'open') {
      this.closePanel();
      return;
    }

    var b = this.$('echofon-popup-browser');
    if (EchofonCommon.isFF4()) {
      b.setAttribute("src", "chrome://echofon/content/sidebar.xul");
    }
    else {
      b.setAttribute("src", "chrome://echofon/content/panel_fx3.xul");
    }

    var params = EchofonCommon.pref().getCharPref("windowParam").split(',');
    p.width =  params[0].split('=')[1];
    p.height = params[1].split('=')[1];

    var x = window.mozInnerScreenX + window.innerWidth - p.width - 20;
    var y = window.mozInnerScreenY + window.innerHeight - p.height - 22;

    p.autoPosition = false;
    p.openPopupAtScreen(x, y);
    p.popupBoxObject.enableRollup(false);
    p.popupBoxObject.setConsumeRollupEvent(1);
    if (EchofonCommon.isFF4()) {
      b.focus();
    }
    else {
      Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).
        initWithCallback({notify: function() {
      document.getElementById('echofon-compose-bar').textbox.focus();
    }
      }, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    }
  },

  rebuildPanel: function() {
    var b = this.$('echofon-popup-browser');
    if (b.getAttribute("src")) {
      b.setAttribute("src", "");
      if (EchofonCommon.isFF4()) {
    b.setAttribute("src", "chrome://echofon/content/sidebar.xul");
      }
      else {
    b.setAttribute("src", "chrome://echofon/content/panel_fx3.xul");
      }
    }
  },

  closePanel: function(no_focus) {
    var p = this.$('echofon-window-popup');
    if (p && p.state == 'open') {
      EchofonCommon.pref().setCharPref("windowParam",
                                       "width=" + p.width +
                                       ",height=" + p.height);
      EchofonCommon.notifyObservers("panelClosed");
      p.hidePopup();
      if (!no_focus) {
        window.content.focus();
      }

      return;
      // following code is not in use
      try {
        var panelContent = this.$('echofon-popup-browser').contentWindow;
        var box = panelContent.contentBox.scrollbox;
        var y = {};
        box.getPosition({}, y);
        if (y.value == 0 && panelContent.activeTab == "home") {
          var b = this.$('echofon-popup-browser').setAttribute("src", "");
        }
      }
      catch (e) {}
    }
  },

  isPanelOpened: function() {
    var p = this.$('echofon-window-popup');
    if (p.state == 'open') {
      return true;
    }
    return false;
  },

  resize: function(event) {
    var p = this.$('echofon-window-popup');
    if (!p) return;
    if (p.state != 'open') return;

    var x = window.mozInnerScreenX + window.innerWidth - p.width - 20;
    var y = window.mozInnerScreenY + window.innerHeight - p.height - 22;

    p.moveTo(x, y);
  },

  observe: function(subject, topic, data) {

    if (topic == 'quit-application-granted') {
      EchofonCommon.pref().setBoolPref("openWindowAtLaunch", this.echofonMainWindow() ? true : false);
    }

    if (topic != "echofon-status") return;

    var msg = JSON.parse(data);
    if (this[msg.state]) {
      try {
        this[msg.state](msg.data);
      }
      catch (e) {
        Components.utils.reportError(e.message + " on " + msg.state + "(" + e.fileName + ":" + e.lineNumber + ")");
      }
    }
  },

  //
  // methods
  //
  updateUser: function() {
    this.setButtonState("inactive");
  },

  showUnreadCount: function(flag) {
    var isHidden = (flag && parseInt(unreadCountElem.value) > 0) ? false : true;
    this.$('echofon-statusbar-unread-count').setAttribute("hidden", isHidden);
    var toolbar = this.$('echofon-toolbar-button');
    if (toolbar) toolbar.setAttribute("hideUnread", isHidden);
  },

  resetUnreadCount: function() {
    var unreadCountElem = this.$('echofon-statusbar-unread-count');
    unreadCountElem.value = 0;
    this.$('echofon-statusbar-unread-count').setAttribute("hidden", true);
    var toolbar = this.$('echofon-toolbar-button');
    if (toolbar) {
      toolbar.setAttribute("hideUnread", true);
      toolbar.setAttribute("unread", 0);
      toolbar.setAttribute("label", "Echofon");
    }
  },

  addUnreadCount: function(count) {
    var unreadCountElem = this.$('echofon-statusbar-unread-count');
    if (unreadCountElem.value != "") {
      count += parseInt(unreadCountElem.value);
    }
    this.setUnreadCount(count);
  },

  setUnreadCount: function(count) {
    var unreadCountElem = this.$('echofon-statusbar-unread-count');
    var toolbar = this.$('echofon-toolbar-button');
    if (count < 0) count = 0;
    if (count > 0) {
      unreadCountElem.value = count;
      if (toolbar) toolbar.setAttribute("unread", count);
      if (EchofonCommon.pref().getBoolPref("unreadCount")) {
          unreadCountElem.setAttribute("hidden", false);
          if (toolbar) {
            if (toolbar.parentNode.getAttribute("mode") == 'text') {
              toolbar.setAttribute("label", "Echofon (" + count +")");
            }
            else {
              toolbar.setAttribute("hideUnread", false);
        }
      }
      }
    }
    else {
      unreadCountElem.value = 0;
      if (toolbar) {
        toolbar.setAttribute("unread", 0);
        toolbar.setAttribute("hideUnread", true);
        toolbar.setAttribute("label", "Echofon");
      }
      unreadCountElem.setAttribute("hidden", true);
      this.setButtonState("");
    }
  },

  markReadBySync: function(data) {
    let total = 0;
    for (var key in data) {
      if (data.hasOwnProperty(key))
        total += data[key];
    }
    this.addUnreadCount(-total);
  },

  updateUnreadCount: function(unread) {
    var total = 0;
    for (var i in unread) {
      if (unread.hasOwnProperty(i)) {
    total += unread[i];
      }
    }
    this.setUnreadCount(total);
  },

  playSound: function() {
    if (EchofonCommon.pref().getBoolPref("sound")) {
      try {
        var IOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
        var localFile = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
        var url = EchofonCommon.pref().getCharPref("soundFile");

        localFile.initWithPath(url);

        this._sound.play(IOService.newFileURI(localFile));
      }
      catch (e) {
      }
    }
  },

  receivedNewTweets: function(params) {
    this.clearErrors();

    // do nothing if window is minimized
    if (window.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MINIMIZED) return;

    var user_id = EchofonCommon.pref().getCharPref("activeUserId");
    if (user_id != params.user_id) {
      return;
    }

    var tweets = params.tweets.reverse();

    var unreadTweets = [];
    for (var i = 0; i < tweets.length; ++i) {
      if (tweets[i].unread) {
        this.setButtonState("active");
        unreadTweets.push(tweets[i]);
      }
    }

    if (unreadTweets.length > 0) {
      this.playSound();
      this.addUnreadCount(unreadTweets.length);
    }

    // Update balloon
    this._messageQueue = this._messageQueue.concat(unreadTweets);

    var panel = this.$("echofon-popup");

    if (this._messageQueue.length > 5) {
      if (panel.state != 'open') {
        this.showNotice(EchofonCommon.getFormattedString("MoreThan5Tweets", [this._messageQueue.length]));
        this._messageQueue = [];
    return;
      }
    }

    if (panel.state == 'open') {
      return;
    }
    this.showBalloon();
  },

  tweetDidDelete: function(tweet) {
    var count = 0;
    var unreadCountElem = this.$('echofon-statusbar-unread-count');
    var toolbar = this.$('echofon-toolbar-button');
    if (unreadCountElem.value != "") {
      count = parseInt(unreadCountElem.value);
    }
    if(--count < 0) count = 0;
    this.setUnreadCount(count);
  },

  failedToSendMessage: function(context) {
    if (context.node == "identity-box") {
      var loc = document.getElementById("identity-box");
      var panel = EchofonCommon.openComposeWindow(loc, context.status);
      panel.error = context.error;
    }
  },

  clearErrors: function(data) {
    try {
      this.showMessage("");
      this.updateTooltip();
      var btn = this.$("echofon-statusbar-button");
      if (btn) btn.setAttribute("error", "0");
      var tbtn = this.$("echofon-toolbar-button");
      if (tbtn) tbtn.setAttribute("error", "0");
    }
    catch (e) {}
  },

  updateTooltip: function() {
    var elem = this.$("echofon-last-update");
    var d = new Date();
    var h = d.getHours();
    if (h < 10) h = '0' + h;
    var m = d.getMinutes();
    if (m < 10) m = '0' + m;
    elem.value = EchofonCommon.getFormattedString("LastUpdated", [h, m]);
  },

  onTimeoutBalloon: function() {

    this.hideBalloon();
    if (this._messageQueue.length) {
      this.showBalloon();
    }
  },

  showMessage: function(message) {
    try {
      var elem = this.$("echofon-status-tooltip");
      if (message) {
        this.setButtonState("error");
        elem.setAttribute("value", message);
      }
      else {
        var btn = this.$("echofon-statusbar-button");
        if (btn) {
          btn.setAttribute("error", "0");
        }
        var tbtn = this.$("echofon-toolbar-button");
        if (tbtn) {
          tbtn.setAttribute("error", "0");
        }
        elem.setAttribute("value", "Echofon");
      }
    }
    catch (e) {}
  },

  setButtonState: function(state) {
    var btn = this.$("echofon-statusbar-button");
    var tbtn = this.$("echofon-toolbar-button");
    if (state == "error") {
      if (btn) btn.setAttribute("error", "1");
      if (tbtn) tbtn.setAttribute("error", "1");
    }
    else {
      if (btn) {
        btn.setAttribute("error", "0");
        btn.setAttribute("state", state);
      }
      if (tbtn) {
        tbtn.setAttribute("error", "0");
        tbtn.setAttribute("state", state);
      }
    }
  },

  showBalloon: function() {
    if (this._messageQueue.length > 5) {
      this.showNotice(EchofonCommon.getFormattedString("MoreThan5Tweets", [this._messageQueue.length]));
      this._messageQueue = [];
      return;
    }

    var msg = this._messageQueue.shift();

    while (msg) {
      if (EchofonCommon.pref().getBoolPref("popup-mentions-and-dms")) {
        if (msg.type != 'mentions' && msg.type != 'message' && msg.has_mention == false) {
          msg = this._messageQueue.shift();
          continue;
        }
      }
      else if (msg.unread == false) {
        msg = this._messageQueue.shift();
        continue;
      }
      break;
    }

    if (msg) {
      var elem = document.createElement('echofon-popup-content');
      elem.tweet = msg;
      elem.user = msg.user;
      this.popupBalloon(elem);
    }
  },

  showNotice: function(msg) {
    var elem = document.createElement("echofon-notice");
    elem.setAttribute("value", msg);
    this.popupBalloon(elem);
  },

  popupBalloon: function(elem) {

    if (!this.canPopup()) {
      this._messageQueue = [];
      return;
    }

    var interval = EchofonCommon.pref().getIntPref("popup-interval");
    if (!interval) {
      interval = 3;
    }
    this.$("echofon-popup").showBalloon(elem, interval);
  },

  windowClosed: function() {
  },

  hideBalloon: function() {
    try {
      this.$("echofon-popup").hideBalloon();
    }
    catch (e) {}
  },

  forceToCloseBalloon: function() {
    try {
      this.$("echofon-popup").hideBalloon();
    }
    catch (e) {}
    this._messageQueue = new Array();
  },

  onClickStatusbarIcon: function(e) {
    if (e.button != 0) return;

    this.toggleWindow();
  },

  focusToWindow: function() {
    this.hideBalloon();
    this._messageQueue = new Array();

    var appMode = EchofonCommon.pref().getCharPref("applicationMode");
    switch(appMode) {
      case "panel":
        var p = this.$('echofon-window-popup');
        if (p.state != 'open') {
      this.openPanel();
    }
    break;

      case "window":
        this.openWindow();
    break;

      case "sidebar":
        toggleSidebar('viewEchofonSidebar', true);
    }
  },

  toggleWindow: function(from_toolbar) {

    if (EchofonCommon.pref().getBoolPref("login") == false || EchofonCommon.pref().getCharPref("activeUserId") == '') {
      var accounts = EchofonCommon.pref().getCharPref("accounts");
      if (EchofonCommon.pref().getCharPref("activeUserId") == '' && accounts == "{}") {
          EchofonCommon.openPreferences();
      return;
      }
      EchofonCommon.pref().setBoolPref("login", true);
      if (EchofonCommon.pref().getCharPref("activeUserId") == '') {
        EchofonCommon.pref().setCharPref("activeUserId", EchofonAccountManager.instance().getPrimaryAccount());
      }
      EchofonCommon.notify("initSession");
    }

    this.hideBalloon();
    this._messageQueue = new Array();

    var appMode = EchofonCommon.pref().getCharPref("applicationMode");
    switch(appMode) {
      case "panel":
        this.openPanel();
    break;

      case "window":
        this.openWindow(from_toolbar);
    break;

      case "sidebar":
        toggleSidebar('viewEchofonSidebar', false);
    break;
    }
  },

  closeWindow: function() {
    var appMode = EchofonCommon.pref().getCharPref("applicationMode");
    switch(appMode) {
      case "panel":
      this.closePanel(true);
      break;

      case "window":
      var win = this.echofonMainWindow();
      if (win) win.close();
      break;

      case "sidebar":
      var sidebarWindow = document.getElementById("sidebar").contentWindow;
      if (sidebarWindow.location.href == "chrome://echofon/content/sidebar.xul") {
        toggleSidebar();
      }
      break;
    }
  },

  toggleSidebarInternal: function() {
    if (EchofonCommon.pref().getCharPref("applicationMode") == "panel") {
      this.closePanel();
    }
    else {
      toggleSidebar('viewEchofonSidebar');
    }
  },

  openWindow: function(close_if_already_opened) {
    this.clearErrors();

    var win = this.echofonMainWindow();
    if (win) {
      if (close_if_already_opened) {
        win.close();
      }
      else {
        win.focus();
      }
    }
    else {
      var param = EchofonCommon.pref().getCharPref("windowParam") + ",chrome,resizable=yes,minimizable=yes,dependent=no";
      window.open("chrome://echofon/content/window.xul", "_echofon", param);
    }
  },

  insertURL: function(url) {
    if (!url) {
      url = content.document.location.toString();
    }
    url = content.document.title + " " + url;

    var loc = document.getElementById("identity-box");
    EchofonCommon.openComposeWindow(loc, url, true);
  },

  askToFollowEchofon: function() {
    var prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
    var out = {};
    var ret = prompt.confirmEx(window, "Echofon", EchofonCommon.getString("FollowEchofon"),
                               1027, null, null, null, null, out);
    if (ret == 0) {
      EchofonCommon.notify("followEchofon");
    }
  },

  onMenuPopupShowing: function(menu) {
    if (EchofonCommon.pref().getBoolPref("licensed")) {
      this.removeAds();
    }
    while (menu.childNodes.length) {
      let item = menu.firstChild;
      if (item.getAttribute("name") == 'account' || item.tagName == "menuseparator") {
        menu.removeChild(item);
      }
      else {
        break;
      }
    }

    let accounts = EchofonAccountManager.instance().allAccounts();
    let user_id = EchofonCommon.pref().getCharPref("activeUserId");
    let isLogin = EchofonCommon.pref().getBoolPref("login");

    for (let i = 0; i < menu.childNodes.length; ++i) {
      let item = menu.childNodes[i];
      if (item.id != 'echofon-menuitem-preference')
        item.setAttribute("disabled", (isLogin) ? false : true);
    }
    if (EchofonAccountManager.instance().numAccounts() == 1) {
      menu.lastChild.setAttribute("disabled", false);EchofonCommon.getString((isLogin) ? "logout" : "login");
      menu.lastChild.setAttribute("label", EchofonCommon.getString((isLogin) ? "logout" : "login"));
    }

    let items = [];
    for (let i in accounts) {
      if (accounts.hasOwnProperty(i)) {
        let item = document.createElement("menuitem");
        let user = accounts[i];
        item.setAttribute("label", user.screen_name);
        item.setAttribute("user_id", user.user_id);
        item.setAttribute("name", "account");
        item.setAttribute("type", "radio");
        let obj = this;
        item.addEventListener("command", function() {obj.changeAccount(user.user_id)}, false);
        //
        // need to figured out how to put image and checkmark on menu popup
        //
        //      item.setAttribute("image", 'http://img.tweetimag.es/i/' + user.screen_name + '_b');
        //      item.className = "menuitem-iconic";

        if (user_id == '') {
          user_id = user;
        }

        if (isLogin && user.user_id == user_id) {
          item.setAttribute("checked", true);
        }
        items.push(item);
      }
    }

    if (items.length > 1) {
      menu.insertBefore(document.createElement('menuseparator'), menu.firstChild);
      for (let i = items.length-1; i >= 0; --i) {
        menu.insertBefore(items[i], menu.firstChild);
      }
    }
  },

  changeAccount: function(user_id) {
    this.resetUnreadCount();
    this._messageQueue = new Array();
    EchofonCommon.pref().setBoolPref("login", true);
    EchofonCommon.notify("changeAccount", {user_id:user_id});
  },

  accountChanged: function() {
    this._messageQueue = new Array();
    this.hideBalloon();
  },

  removeAds: function() {
    var m = this.$('echofon-menuitem-remove-ads');
    if (m) {
      m.parentNode.removeChild(m);
    }
  },

  onLogout: function() {
    if (EchofonCommon.pref().getBoolPref("login") == false) {
      this.changeAccount(EchofonAccountManager.instance().getPrimaryAccount());
      return;
    }

    this.resetUnreadCount();
    this._messageQueue = new Array();
    this.hideBalloon();
    EchofonCommon.notify("logout");
  },

  logout: function() {
    EchofonCommon.pref().setBoolPref("login", false);
    var win = this.echofonMainWindow();
    if (win) win.close();

    var sidebar = document.getElementById("sidebar");
    if (sidebar && sidebar.contentWindow) {
      if (sidebar.contentWindow.location.href == "chrome://echofon/content/sidebar.xul") {
        toggleSidebar('viewEchofonSidebar');
      }
    }
    this.closePanel();

    this.setButtonState("");

    // Close balloon and popup window, reset window settings
    this.hideBalloon();
  },

  internalError: function(msg) {
    this.showMessage(msg);
    this.updateTooltip();
  },

  APIError: function(msg) {
    this.showMessage(msg);
    this.updateTooltip();
  },

  alertMessage: function(data) {
    if (this.isActiveWindow()) {
      alert(data);
    }
  },

  OAuthSignerError: function(msg) {
    if (!this.isActiveWindow("navigator:browser")) return;

    alert("Echofon does not support this platform or custom build Firefox. (Can't get OAuth signer.) / " + msg + " - " + navigator.oscpu);
  },

  failedToAuth: function(obj) {
    if (!this.isActiveWindow("navigator:browser")) return;

    this.showMessage(obj.message);

    let user_id = EchofonCommon.pref().getCharPref("activeUserId");
    let account = EchofonAccountManager.instance().get(user_id);
    if (!account.needToAlertOAuthError()) return;

    if (this._askedToReAuth) return;
    this._askedToReAuth = true;

    alert(EchofonCommon.getFormattedString("AuthFail", [obj.screen_name]) + " (" + obj.message +")");
    let echofon = this;
    EchofonCommon.startOAuth(obj.screen_name, echofon);
  },

  needToReAuth: function(screen_name) {
    if (!this.isActiveWindow("navigator:browser")) return;
    if (this._askedToReAuth) return;
    this._askedToReAuth = true;

    alert("You need to reauthorize with Twitter in order for Echofon to access your account. This is due to a change Twitter made in their authorization system for apps.");
    let obj = this;
    EchofonCommon.startOAuth(screen_name, obj);
  },

  onOAuthWindowClosed: function() {
    this._askedToReAuth = false;
  },

  onFinishOAuth: function(user_id) {
    var account = EchofonAccountManager.instance().get(user_id);
    if (EchofonCommon.pref().getCharPref("activeUserId") == 0) {
      EchofonCommon.pref().setCharPref("activeUserId", account.user_id);
    }
    EchofonCommon.reloadTimeline();
    this._askedToReAuth = false;
  },

  canPopup: function() {
    if (!this._hasFocus) return false;
    // Do not popup while panel-window is open
    var p = this.$('echofon-window-popup');
    if (p && (p.state == 'open' || p.state == "showing")) {
      return false;
    }

    // Do not popup echofon main window or sidebar is active.
    //
    if (!EchofonCommon.pref().getBoolPref("popup-while-window-is-opened")) {
      var sidebarWindow = document.getElementById("sidebar").contentWindow;
      if (sidebarWindow.location.href == "chrome://echofon/content/sidebar.xul") {
    return false;
      }

      if (this.echofonMainWindow()) {
    return false;
      }
    }

    if (!EchofonCommon.pref().getBoolPref("popup")) return false;

    if (!this.isActiveWindow()) return false;

    if (EchofonCommon.pref().getBoolPref("dontPopupWhileTyping") && this._focusInText) {
      return false;
    }

    return true;
  },

  echofonMainWindow: function() {
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var enumerator = wm.getZOrderDOMWindowEnumerator('Echofon:main', true);
    return enumerator.getNext();
  },

  isActiveWindow: function(type) {
    if (!type) type = "";
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var win = wm.getMostRecentWindow(type);
    return (win == window) ? true : false;
  },

  $: function(name) {
    return document.getElementById(name);
  },


  EchofonProgressListener: {
    onStateChange: function (aProgress,aRequest,aFlag,aStatus) {
      const STATE_START = Components.interfaces.nsIWebProgressListener.STATE_START;
      const STATE_IS_DOCUMENT = Components.interfaces.nsIWebProgressListener.STATE_IS_DOCUMENT;
      if(aFlag & (STATE_IS_DOCUMENT|STATE_START)) {
        var urlbar = document.getElementById("urlbar");
        if (urlbar.value.match('^@([A-Za-z0-9_]+)$')) {
          urlbar.value = "chrome://echofon/content/user-view.xul?screen_name=" + RegExp.$1;
          aProgress.DOMWindow.location = urlbar.value;
        }
      }
    },

    onLocationChange:    function (a,b,c) {},
    onProgressChange:    function (a,b,c,d,e,f){},
    onStatusChange:      function (a,b,c,d){},
    onSecurityChange:    function (a,b,c){},
    onLinkIconAvailable: function (a) {}
  }
};

(function() {

  let obj = this;

  window.addEventListener("load",       function(e) { obj.load(e);      }, false);
  window.addEventListener("unload",     function(e) { obj.unload(e);    }, false);
  window.addEventListener("resize",     function(e) { obj.resize(e);    }, false);
  window.addEventListener("activate",   function(e) { obj.activate(e);  }, false);
  window.addEventListener("deactivate", function(e) { obj.deactivate(e);}, false);

  if (navigator.platform.match("Linux")) {
    window.addEventListener("focus",  function(e) { obj.focus(e);  }, true);
    window.addEventListener("blur",   function(e) { obj.blur(e);   }, true);
    }
}).apply( EchofonOverlay );


}
