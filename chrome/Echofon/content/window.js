//
// Implementation of Echofon main window methods
//
// Copyright (c) 2009 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var contentBox      = null;
var activeTab       = "home";
var gAppMode        = "window";
var gActiveList     = null;
var gNoMarkUnread   = false;
var gActiveQuery    = "";
var gTimestampTimer = null;
var gScrollTimer    = null;
var gHoveredCell    = null;
var gLoadMoreTimer  = null;
var g140Timer       = null;
var gAskedToReAuth  = false;
var gIsAdVisible    = false;
var gNeedToReloadAd = false;
var gIdleObserver   = null;
var gUnreadCount    = {'home':0, 'mentions':0, 'messages':0, 'lists':0, 'search':0};

const MAX_UNREAD_TWEETS_COUNT = 500;
const MAX_TWEETS_COUNT        = 200;
const IDLE_TIME_INTERVAL      = 5;
const AD_INTERVAL_TIME        = 10 * 60 * 1000; // 10 min

const gTabs = ['home', 'mentions', 'messages', 'lists', 'search'];
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://echofon/Account.jsm");
Cu.import("resource://echofon/EchofonUtils.jsm");
Cu.import("resource://echofon/EchofonSync.jsm");
//Cu.import("resource://echofon/EchofonGA.jsm");
Cu.import("resource://echofon/Models.jsm");

//
// Initializer
//
function onloadWindow()
{
  contentBox = document.getElementById('echofon-main-window');

  this._observer = new echofonObserver();

  EchofonCommon.initKeyConfig();

  hideSidebarHeader(true);

  gTimestampTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gTimestampTimer.initWithCallback({notify: function() { updateTimestamp(); }}, 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);

  var text = $('echofon-textbox');
  if (text) text.focus();

  gAppMode = EchofonCommon.pref().getCharPref("applicationMode");
  if (gAppMode == "window") {
    $('echofon-toolbar').setAttribute("mode", "window");
  }
  else if (gAppMode == "panel") {
    $('echofon-toolbar').setAttribute("mode", "panel");
  }

  if (EchofonCommon.isXULRunner() || gAppMode == "window") {
    if (navigator.platform.match("Win32") && EchofonCommon.isFF4()) {
      $('echofon-menubar').hidden = true;
      $('echofon-titlebar').hidden = false;

      Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer)
        .initWithCallback({notify: function() {
            $('echofon-window').setAttribute("chromemargin", "0,-1,-1,-1");
          }
        },
        10, Ci.nsITimer.TYPE_ONE_SHOT);
    }
  }

  var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
  if (navigator.platform.match("Win32") && EchofonCommon.isFF4() && navigator.userAgent.match(/Windows NT 6\.\d/)) {
    var uri = ios.newURI("chrome://echofon/skin/vista.css", null, null);
    if (EchofonCommon.isXULRunner() || EchofonCommon.pref().getCharPref("applicationMode") == "window") {
      sss.loadAndRegisterSheet(uri, sss.AGENT_SHEET);
    }
    else {
      try {
        sss.unregisterSheet(uri, sss.AGENT_SHEET);
      }
      catch (e) {}
    }
  }
  if (!EchofonCommon.isFF4()) {
    var uri = ios.newURI("chrome://echofon/content/ff3.css", null, null);
    sss.loadAndRegisterSheet(uri, sss.AGENT_SHEET);
  }

  if (navigator.platform.match("Mac") && EchofonCommon.isFF4() && navigator.userAgent.match(/Mac OS X 10.7/)) {
    $('echofon-compose-bar').setAttribute("lion", "true");
  }

  if (EchofonCommon.isXULRunner()) {
    EchofonCommon.notify("init");

    if (EchofonAccountManager.instance().numAccounts() == 0) {
      document.getElementById("echofon-main-window-content").hidden = true;
      var b = document.getElementById("echofon-welcome-screen");
      b.hidden = false;
      b.setAttribute("src", "chrome://echofon/content/welcome.xul");
      $('echofon-appmenu-button').hidden = true;
      return;
    }
  }
  delayInitWindow();
}

function loginCompleted()
{
  document.getElementById("echofon-main-window-content").hidden = false;
  var b = document.getElementById("echofon-welcome-screen");
  b.parentNode.removeChild(b);
  $('echofon-appmenu-button').hidden = false;
  this.delayInitWindow();
  window.openDialog("chrome://echofon/content/welcome.xul", "",
                              "chrome,dialog=yes,titlebar,centerscreen,resizable=no,dependent=no,width=440,height=600");
}

function delayInitWindow()
{
  if (!EchofonModel.isInitialized()) return;
  var user_id = this.activeUser();
  if (user_id == 0) return;
  var user = EchofonModel.User.findById(user_id, user_id);
  updateUser(user);

  var tab = 'home';
  if (gAppMode == "sidebar") {
    tab = EchofonCommon.pref().getCharPref("lastTab");
  }

  if (tab != 'home') {
    EchofonCommon.notify("restoreSession");
    changeTab(tab);
  }
  else {
    //EchofonGA.instance().trackPage("/home");
    getTimeline(user_id, activeTab);
    EchofonCommon.notify("restoreSession");
  }

  if (EchofonCommon.isXULRunner()) {
    window.focus();
  }

  gIdleObserver = {
    idle:"",
    observe: function(subject, topic, data) {
      this.idle = topic;
      if (topic == "back" && gNeedToReloadAd) {
        reloadAd();
      }
    }
  };

  var idleService = Cc["@mozilla.org/widget/idleservice;1"].getService(Ci.nsIIdleService);
  idleService.addIdleObserver(gIdleObserver, IDLE_TIME_INTERVAL);
}

function updateUnreadCount(unread)
{
  gUnreadCount = unread;
  setUnreadCountToTitleBar();
}

function setUnreadCountToTitleBar()
{
  if (!EchofonCommon.isXULRunner()) return;

  var c = 0;
  for (var i in gUnreadCount) {
    c += gUnreadCount[i];
  }
  var title = "Echofon";
  if (c > 0) {
    title += " (" + c + ")";
  }
  $('echofon-window').setAttribute('title', title);
}

function restoreSession(data)
{
  if (data.query) {
    gActiveQuery = data.query;

    var elem = $('echofon-add-search-button');
    elem.disabled = false;
    if (EchofonModel.SavedSearch.isExist(data.query, this.activeUser())) {
      elem.label = '-';
      elem.setAttribute('tooltiptext', EchofonCommon.getString("removeThisSavedSearch"));
    }
    else {
      elem.label =  '+';
      elem.setAttribute('tooltiptext', EchofonCommon.getString("saveThisSearch"));
    }

    var sc = document.getElementById("echofon-search-container");
    if (sc) sc.parentNode.removeChild(sc);
    document.getElementById("echofon-search-text-box").value = data.query;
  }
  gActiveList = data.list;
}

function updateUnreadState(unreads)
{
  var toolbar = $('echofon-toolbar');
  for (var i in unreads) {
    var unread = unreads[i];
    toolbar.setUnread(gTabs[i], unreads[i]);
  }
}

function updateTimestamp()
{
  var elems = contentBox.container.getElementsByClassName("echofon-status-timestamp");
  var appmode = EchofonCommon.pref().getCharPref("applicationMode");

  var now = new Date();

  for (var i in elems) {
    var e = elems[i];
    try {
      var created_at = e.created_at;
      if (created_at) {
        var label = EchofonCommon.getLocalTimeForDate(created_at, appmode != 'window');
        var orig = e.childNodes[0].nodeValue;
        if (orig != label) {
            e.childNodes[0].nodeValue = label;
        }
      }
    }
    catch (e) {}
  }
  var elems = contentBox.getContainer('messages').childNodes;
  for (var i in elems) {
    try {
      elems[i].updateTimestamp();
    }
    catch (e) {}
  }
}

function onbeforeunloadWindow()
{
  // need to confirm if compose window has a draft
  EchofonCommon.closeComposeWindow();
}

function onunloadWindow()
{
  if (gAppMode == 'window') {

    var totalHeight = 0;

    if (navigator.platform.match("Win32") && EchofonCommon.isFF4()) {
      var h = parseInt(window.getComputedStyle($('echofon-titlebar'), null).height);
      if (!isNaN(h)) {
        totalHeight += h;
      }
    }

    EchofonCommon.pref().setCharPref("windowParam",
                                     "width=" + window.innerWidth +
                                     ",height=" + (window.innerHeight - totalHeight));
  }
  else if (gAppMode == "sidebar") {
    EchofonCommon.pref().setCharPref("lastTab", activeTab);
  }

  this._observer.remove();
  this.markRead();

  hideSidebarHeader(false);

  this.notifyStatusToWindows("windowClosed");
  EchofonCommon.notify("compaction");

  gTimestampTimer.cancel();

  if (EchofonCommon.isXULRunner()) {
    var appStartup = Components.classes['@mozilla.org/toolkit/app-startup;1'].
      getService(Components.interfaces.nsIAppStartup);
    appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
  }

  if (gIdleObserver) {
    var idleService = Cc["@mozilla.org/widget/idleservice;1"].getService(Ci.nsIIdleService);
    idleService.removeIdleObserver(gIdleObserver, IDLE_TIME_INTERVAL);
    gIdleObserver = null;
  }
}

function getMainWindowFromSidebar()
{
  return window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIWebNavigation)
                   .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIDOMWindow);
}

function hideSidebarHeader(hide)
{
  if (EchofonCommon.pref().getCharPref("applicationMode") != "sidebar") return;
  var mainWindow = getMainWindowFromSidebar();
  try {
    if (hide) {
      mainWindow.document.getElementById('sidebar-header').style.display = 'none';
    }
    else {
      mainWindow.document.getElementById('sidebar-header').style.display = '';
    }
  }
  catch (e) {}
}

function onloadSidebar()
{
  gAppMode = (EchofonCommon.pref().getCharPref("applicationMode") == "panel") ? "panel" : "sidebar";
}

function focusToBrowser()
{
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  var win = wm.getMostRecentWindow("navigator:browser");
  if (win) win.focus();
}

function toggleSidebar()
{
  if (EchofonCommon.pref().getCharPref("applicationMode") == "panel") {
    markRead();
  }
  getMainWindowFromSidebar().EchofonOverlay.toggleSidebarInternal();
}

//
// Event handler
//
function onfocusWindow()
{
}

function onblurWindow()
{
 if (gAppMode == "sidebar") return;
  var box = contentBox.scrollbox;
  var y = {};
  try {
    box.getPosition({}, y);
    if (y.value == 0) {
      markRead();
    }
  }catch (e) {}
}

function onScrollTweetBox(event)
{
  var box = contentBox.scrollbox;
  var y = {};
  var height = {};
  box.getPosition({}, y);
  box.getScrolledSize({}, height);

  var ad = $('echofon-ad-unit');
  if (activeTab == 'home' && ad) {
    var adHeight = window.getComputedStyle(ad, null).height;
    adIsVisible(y.value < parseInt(adHeight));
  }
  if (y.value + box.height >= height.value) {

    // If content is search top, do not call paging method

    var elem = contentBox.loadMore();

    if (elem && gLoadMoreTimer == null) {
      if (elem.noMoreTweet || elem.spinner) return;
      elem.spinner = true;
      loadMore();
    }
  }
  if (y.value == 0 && !gNoMarkUnread) {
    this.markRead();
  }
  gNoMarkUnread = false;
  if (gScrollTimer) gScrollTimer.cancel();
  gScrollTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gScrollTimer.initWithCallback({
    notify: function() {
      if (gHoveredCell) {
        gHoveredCell.hover();
      }
      gScrollTimer = null;
      gHoveredCell = null;
    }
  }, 150, Ci.nsITimer.TYPE_ONE_SHOT);
}

function loadMore()
{
  gLoadMoreTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gLoadMoreTimer.initWithCallback({
    notify: function() {
      var e = contentBox.loadMore(activeTab);
      if (!e) return;
      e = e.previousSibling;
      // ignore unread border
      while (e && e.tagName == "echofon-unread-border") {
        e = e.previousSibling;
      }

      if (e) {
        EchofonCommon.notify("getNextPage",
                             {user_id:activeUser(),
                              type:activeTab,
                              list:gActiveList,
                              query:gActiveQuery,
                              max_id:e.getAttribute("messageId")});
      }
      gLoadMoreTimer = null;
    }}, 200, Ci.nsITimer.TYPE_ONE_SHOT);
}

function onresizeWindow()
{
  if (!contentBox) return;
  // need to tweak scrollbox width
  var w = window.innerWidth - 16;
  var elems = contentBox.container.getElementsByClassName('echofon-status-body');

  for (var i = 0; i < elems.length; i++) {
    var e = elems[i];
    e.style.width = (w - e.closest('echofon-status').padding) + "px";
  }
  var ad = $('echofon-ad');
  if (ad) {
    ad.width = w + "px";
  }
}

function onActivateWindow()
{
  if (EchofonCommon.pref().getCharPref("applicationMode") == "window") {
    adIsVisible(true);
  }
}

function onDeactivateWindow()
{
  if (EchofonCommon.pref().getCharPref("applicationMode") == "window") {
    adIsVisible(false);
  }
}

function adIsVisible(flag)
{
  if (gIsAdVisible == flag) return;

  var ad = $('echofon-ad-unit');
  if (ad) {
    var box = contentBox.scrollbox;
    var y = {};
    box.getPosition({}, y);
    var adHeight = window.getComputedStyle(ad, null).height;

    if (y.value >= parseInt(adHeight)) {
      flag = false;
    }
    if (gIsAdVisible == flag) return;
    gIsAdVisible = flag;
    if (flag && gNeedToReloadAd) {
      reloadAd();
    }
  }
}

function scrollBy(direction)
{
  var box = contentBox.scrollbox;
  box.scrollByIndex(direction);
}

function scrollTo(event)
{
  var box = contentBox.scrollbox;
  switch (event.keyCode) {
    case event.DOM_VK_HOME:
      box.scrollTo(0, 0);
      break;
    case event.DOM_VK_END:
      let boxheight = {};
      let lastElem = box.lastChild;
      let h = parseInt(window.getComputedStyle(lastElem, null).height);
      box.getScrolledSize({}, boxheight);
      box.scrollTo(0, boxheight.value-h-1);
      break;
    case event.DOM_VK_PAGE_UP:
      box.scrollBy(0, -box.height);
      break;
    case event.DOM_VK_PAGE_DOWN:
      box.scrollBy(0, box.height);
      break;
  }
}

function getTimeline(user_id, tab, list)
{
  EchofonCommon.notify("getTimeline", {user_id:user_id, type:tab, list:list});
}

function addLoadMoreCell(container)
{
  var loadmore = document.createElement("echofon-load-more");
  container.appendChild(loadmore);
  return loadmore;
}

function removeLoadMoreCell(tab)
{
  var e = contentBox.loadMore(tab);
  if (e) {
    e.spinner = false;
    e.noMoreTweet = true;
  }
}

function receivedNewTweets(params)
{
  var tweets = params.tweets;

  if (!this.isActiveUser(params.user_id)) return;
  if (tweets.length == 0) return;
  if (tweets[0].type == 'search' && !gActiveQuery) return;

  var c = contentBox.getContainer(params.type);
  if (c.childNodes.length == 0) {
    getTimeline(this.activeUser(), params.type);
  }

  var e = contentBox.loadMore(params.type);
  if (!e) {
    addLoadMoreCell(contentBox.getContainer(params.type));
  }
  else if (e.spinner && tweets.length > 1) {
    e.spinner = false;
  }

  var box = contentBox.scrollbox;
  var y = {};
  box.getPosition({}, y);

  var needToAdjustScroll = false;

  var unreadElem = null;
  var totalHeight = 0;
  var newElements = [];

  var activeUser = this.activeUser();

  // build new elements
  for (var i = 0; i < tweets.length; ++i) {
    var msg = tweets[i];

    if (msg.unread) {
      gUnreadCount[msg.type] += 1;
      needToAdjustScroll = true;
    }
    var elem = EchofonCommon.createMessageBalloon(activeUser, msg, true);
    if (elem) {
      newElements.push(elem);
    }
  }

  // handle unread border and insert elements
  var border = document.getElementById('echofon-unread-border-' + params.type);
  var needToAddBorderHeight = border == null;

  var insertPoint = c.firstChild;
  if (insertPoint.tagName == 'echofon-ad-unit') insertPoint = insertPoint.nextSibling;
  var firstUnreadElem = null;
  for (var i = 0; i < newElements.length; ++i) {
    var elem = newElements[i];
    if (elem.unread) firstUnreadElem = elem;
    c.insertBefore(elem, insertPoint);
  }

  if (border == null || !border.unread) {
    if (firstUnreadElem) {
      border = addUnreadBorder(firstUnreadElem, params.type, false);
    }
  }

  // remove older tweets
  if (c.childNodes.length > MAX_UNREAD_TWEETS_COUNT) {
    EchofonUtils.debug("container has too many tweets: " + c.childNodes.length);
    while (c.childNodes.length > MAX_UNREAD_TWEETS_COUNT) {
      var e = c.lastChild;
      while (e.tagName == "echofon-unread-border" || e.tagName == "echofon-load-more") e = e.previousSibling;
      c.removeChild(e);
    }
  }


  var boxheight = {};
  box.getScrolledSize({}, boxheight);
  if (y.value < boxheight.value / 2) {
    while (c.childNodes.length > MAX_TWEETS_COUNT) {
      var e = c.lastChild;
      while (e.tagName == "echofon-unread-border" || e.tagName == "echofon-load-more") e = e.previousSibling;
      if (e == null) break;
      if (e.unread) break;
      c.removeChild(e);
    }
  }

  setUnreadCountToTitleBar();
  if (activeTab != tweets[0].type) return;

  // scroll to first unread
  if (needToAdjustScroll) {
    if (needToAddBorderHeight) {
      try {
        let h = parseInt(window.getComputedStyle(border, null).height);
        if (!isNaN(h)) totalHeight += h - 1;
      }
      catch (e) {}
    }
    // maintain position if user already scrolls content
    if (y.value != 0 || $('echofon-menu-popup').state == 'open') {

      for (var i in newElements) {
        var height = parseInt(window.getComputedStyle(newElements[i], null).height);
        if (!isNaN(height)) totalHeight += height+1;
      }
      var boxheight = {};
      box.getScrolledSize({}, boxheight);
      if (y.value + totalHeight + box.height >= boxheight.value) {
        box.scrollTo(0, boxheight.value - box.height - 1);
      }
      else {
        box.scrollBy(0, totalHeight);
      }
    }
    else if (border) {
      box.ensureElementIsVisible(border.nextSibling);
    }
  }

  showMessage("");
}

function updateDMThreads(params)
{
  if (!this.isActiveUser(params.user_id)) return;

  var container = contentBox.getContainer('messages');
  EchofonCommon.removeAllChild(container);

  var unread = false;

  for (var i in params.threads) {
    if (params.threads[i].unread) {
      unread = true;
    }
    var elem = EchofonCommon.createThreadCell(this.activeUser(), params.threads[i]);
    container.appendChild(elem);
  }
  $('echofon-toolbar').setUnread('messages', unread);
  addLoadMoreCell(container);
}

function clearErrors(data)
{
  showMessage("");
}

function composeBar()
{
  var bar = $('echofon-compose-bar');
  if (!bar) {
    bar = parent.document.getElementById("echofon-compose-bar");
  }
  return bar;
}

function showMessage(msg)
{
  var nb = $("echofon-notificationbox");
  if (!msg || msg == "") {
    nb.removeAllNotifications();
  }
  else {
    var priority = nb.PRIORITY_INFO_MEDIUM;
    if (arguments[1]) priority = nb.PRIORITY_WARN_MEDIUM;
    // do not overwrite same level notification

    if (nb.currentNotification && nb.currentNotification.priority == priority) return;
    nb.removeAllNotifications();
    if (nb.timer) nb.timer.cancel();

    var elem = nb.appendNotification(msg, '', '', priority, {});
    elem.className += " echofon-notification";
    nb.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    nb.timer.initWithCallback({notify: function() { $('echofon-notificationbox').removeAllNotifications() }}, 3000, Ci.nsITimer.TYPE_ONE_SHOT);
  }
}


//
// build timeline
//
function buildTimeline(data)
{
  var msgs = data.msgs;
  var type = data.type;

  var c = contentBox.getContainer(type);

  if (type == 'home') {
    addAds();
  }

  if (msgs.length) {
    var loadmore = contentBox.loadMore(type);
    if (!loadmore) {
      loadmore = addLoadMoreCell(c);
    }
  }

  var unread = null;
  var unreadCount = 0;

  var elems = [];
  var uid = this.activeUser();
  for (var i in msgs) {
    var elem = EchofonCommon.createMessageBalloon(uid, msgs[i], true);
    if (!elem) continue;
    c.insertBefore(elem, loadmore);
    if (msgs[i].unread) {
      unread = elem;
      gUnreadCount[msgs[i].type] += 1;
    }
  }

  if (unread) {
    addUnreadBorder(unread, type, true);
  }
  setUnreadCountToTitleBar();
}

function addUnreadBorder(ref, tab, scroll)
{
  if (ref.nextSibling == null) return null;
  if (ref.nextSibling.tagName == 'echofon-load-more') return null;

  $('echofon-toolbar').setUnread(tab, true);

  if (tab == 'messages') return null;
  var c = contentBox.getContainer(tab);


  var border = document.getElementById('echofon-unread-border-' + tab);
  if (border) {
    if (!border.unread) {
      removeUnreadBorder(border, tab);
    }
    else {
      return border;
    }
  }
  else {
    border = document.createElement('echofon-unread-border');
    border.id = 'echofon-unread-border-' + tab;
  }
  border.unread = true;
  ref.setAttribute("border", true);
  c.insertBefore(border, ref.nextSibling);
  if (scroll) {
    contentBox.scrollbox.ensureElementIsVisible(border.nextSibling);
  }
  return border;
}

function removeUnreadBorder(border, tab)
{
  if (border == null && tab != 'messages') return;
  var c = contentBox.getContainer(tab);
  if (border) {
    if (border.previousSibling) {
      border.previousSibling.setAttribute("border", false);
    }
    c.removeChild(border);
  }
}

// insert tweet at first
//
function insertTweet(elem, c)
{
  var insertPoint = null;
  var unread = true;
  for (var i = 0; i < c.childNodes.length; ++i) {
    insertPoint = c.childNodes[i];
    if (insertPoint.tagName == 'echofon-unread-border') {
      unread = false;
      continue;
    }
    if (insertPoint.tagName == 'echofon-ad-unit') {
      continue;
    }
    if (insertPoint.tagName == 'echofon-load-more') {
      break;
    }
    // check the element is already in the container
    if (insertPoint.getAttribute("messageId") == elem.getAttribute("messageId")) {
      return -1;
    }
    if (elem.createdAt > insertPoint.createdAt) {
      break;
    }
  }

  c.insertBefore(elem, insertPoint);
  while (c.childNodes.length > 1000) {
    var e = c.lastChild;
    if (e.tagName == "echofon-load-more") e = e.previousSibling;
    c.removeChild(e);
  }
  return (unread) ? 1 : 0;
}

// append tweet at last
//
function appendTweet(elem, type)
{
  var c = contentBox.getContainer(type);
  var e = contentBox.loadMore(type);
  if (e) {
    c.insertBefore(elem, e);
  }
  else {
    c.appendChild(elem)
  }
}

function tweetDidDelete(tweet)
{
  var elems = EchofonCommon.findStatusElement(tweet.id);
  for (var i in elems) {
    var elem = elems[i];

    var parentRects = elem.parentNode.getClientRects();
    var rects = elem.getClientRects();

    var top = rects[0].top - parentRects[0].top;
    var height = rects[0].height;

    var border = document.getElementById('echofon-unread-border-' + elem.getAttribute("type"));
    var box = contentBox.scrollbox;

    var y = {};
    box.getPosition({}, y);

    if (border && elem.id == border.previousSibling.id) {
      var borderRect = border.getClientRects();
      top = borderRect[0].top - parentRects[0].top;
      height += borderRect[0].height;
      border.parentNode.removeChild(border);
    }
    if (elem.unread) {
      gUnreadCount[elem.getAttribute("type")] -= 1;
      setUnreadCountToTitleBar();
    }
    elem.parentNode.removeChild(elem);

    if (top < y.value) {
      box.scrollBy(0, -height);
    }
  }
}

function didBlockUser(user)
{
  for (var i in gTabs) {
    var removed = [];
    var c = contentBox.getContainer(gTabs[i]);
    for (var j = 0; j < c.childNodes.length; ++j) {
      var t = c.childNodes[j];
      try {
      if (t.user.id == user.id) {
        removed.push(t);
      }
      }catch (e) {}
    }
    for (var j in removed) {
      c.removeChild(removed[j]);
    }
  }
}

//
// lists
//
function buildListMenu()
{
  EchofonCommon.notify("loadAllList");

  var menu = $('echofon-list-menupopup');
  var items = [];
  while (menu.childNodes.length > 1) {
    menu.removeChild(menu.lastChild);
  }

  var lists = EchofonModel.List.loadAll(activeUser());

  if (lists.length == 0) return;

  var firstSp = document.createElement('menuseparator');
  var secondSp = document.createElement('menuseparator');
  menu.appendChild(firstSp);
  menu.appendChild(secondSp);

  var acct = EchofonAccountManager.instance().get(this.activeUser());
  var selected = null;

  for (var i in lists) {
    var list = lists[i];
    var menuitem = document.createElement('menuitem');
    menuitem.className = "menuitem-iconic";
    menuitem.id = 'list-' + list.user.id + '-' + list.id;
    menuitem.setAttribute('label', list.name);
    menuitem.setAttribute('value', list.id);
    menuitem.setAttribute('image', list.user.profile_image_url);
    menuitem.setAttribute('autocheck', true);
    menuitem.list = list;
    menuitem.addEventListener("command", function() {onListSelected(this)}, false);

    if (isActiveUser(list.user.id)) {
      menu.insertBefore(menuitem, secondSp);
    }
    else {
      menu.appendChild(menuitem);
    }

    if (acct.list_id == list.id) {
      gActiveList = list;
      selected = menuitem;
    }
  }

  if (selected) $('echofon-list-menulist').selectedItem = selected;
}

function resetListMenu()
{
  var menu = $('echofon-list-menupopup');
  var items = [];
  while (menu.childNodes.length > 1) {
    menu.removeChild(menu.lastChild);
  }
  $('echofon-list-menulist').selectedItem = menu.firstChild;
}

function buildSearchMenu()
{
  if (!document.getElementById("echofon-search-container")) {
    var c = document.createElement('vbox');
    c.id = 'echofon-search-container';
    c.setAttribute("flex", "1");
    contentBox.container.appendChild(c);

    var ss = EchofonModel.SavedSearch.loadAll(this.activeUser());
    for (var i in ss) {
      var e = document.createElement('echofon-saved-search');
      e.setAttribute("keyword", ss[i].query);
      e.setAttribute("ssid", ss[i].id);
      e.id = "echofon-saved-search-" + ss[i].query;
      c.appendChild(e);
    }
  }

  var acct = EchofonAccountManager.instance().get(this.activeUser());
  if (acct.settings) {
    var c = document.getElementById("echofon-trend-location");
    var trend_location = "Worldwide";
    var settings = JSON.parse(acct.settings);
    if (settings.trend_location) {
      trend_location = settings.trend_location[0].name;
    }
    c.setAttribute("value", trend_location);
  }

  EchofonCommon.notify("getSavedAndTrends");
}

function updateSavedSearches(ss)
{
  var c = document.getElementById("echofon-search-container");
  if (!c) return;

  var elems = [];
  for (var i = 0; i < c.childNodes.length; ++i) {
    var e = c.childNodes[i];
    if (e.tagName == 'echofon-saved-search') {
      elems.push(e);
    }
  }
  for (var i in elems) {
    c.removeChild(elems[i]);
  }

  for (var i in ss) {
    var e = document.createElement('echofon-saved-search');
    e.setAttribute("keyword", ss[i].query);
    e.setAttribute("ssid", ss[i].id);
    e.id = "echofon-saved-search-" + ss[i].query;
    c.appendChild(e);
  }
}

function updateTrends(trends)
{
  var c = document.getElementById("echofon-search-container");
  if (!c) return;

  var acct = EchofonAccountManager.instance().get(this.activeUser());
  if (acct.settings) {
    var trend_location = document.getElementById("echofon-trend-location");
    var trend_location_name = "Worldwide";
    var settings = JSON.parse(acct.settings);
    if (settings.trend_location) {
      trend_location_name = settings.trend_location[0].name;
    }
    trend_location.setAttribute("value", trend_location_name);
  }

  // Clear old trends first
  var elems = [];
  for (var i = 0; i < c.childNodes.length; ++i) {
    var e = c.childNodes[i];
    if (e.tagName == 'echofon-trend') {
      elems.push(e);
    }
  }
  for (var i in elems) {
    c.removeChild(elems[i]);
  }

  // Insert new trends
  for (var i in trends.trends) {
    var key = trends.trends[i];
    var e = document.createElement('echofon-trend');
    e.setAttribute('keyword', key.name);
    c.appendChild(e);
  }
}

function onKeyDownSearchBox(event, box)
{
  if (event.keyCode == event.DOM_VK_RETURN) {
    searchTweets(box.value);
    event.preventDefault();
    event.stopPropagation();
  }
  if (event.keyCode == event.DOM_VK_TAB) {
    changeTab((event.shiftKey) ? 3 : 0);
    event.preventDefault();
    event.stopPropagation();
  }
}

function onCommandSearchBox(box)
{
  if (!box.value) {
    searchTweets(box.value);
  }
}

function searchTweets(query)
{
  if (activeTab != 'search') {
    changeTab(4);
  }
  if (gActiveQuery == query) return;
  gActiveQuery = query;

  var elem = $('echofon-add-search-button');
  elem.disabled = query == '';
  if (EchofonModel.SavedSearch.isExist(query, this.activeUser())) {
    elem.label =  '-';
    elem.setAttribute('tooltiptext', EchofonCommon.getString("removeThisSavedSearch"));
  }
  else {
    elem.label = '+';
    elem.setAttribute('tooltiptext', EchofonCommon.getString("saveThisSearch"));
  }

  document.getElementById("echofon-search-text-box").value = query;

  var c = contentBox.getContainer('search');
  EchofonCommon.removeAllChild(c);

  if (query) {
    addLoadMoreCell(c).spinner = true;
    EchofonCommon.notify("searchTweets", {query:query});
  }
  else {
    buildSearchMenu();
    markRead();
    contentBox.scrollbox.scrollTo(0, 0);
    EchofonCommon.notify("clearSearch");
  }
  var acct = EchofonAccountManager.instance().get(this.activeUser());
  acct.setValue('query', query);
  acct.save();
}

function saveSearch(query)
{
  var elem = $('echofon-add-search-button');
  if (elem.label == '-') {
    var ssId = EchofonModel.SavedSearch.isExist(query, this.activeUser());
    EchofonCommon.notify("destroySavedSearch", {id:ssId});
  }
  else {
    EchofonCommon.notify("saveSearch", {query:query});
  }
}

function destroySavedSearch(elem)
{
  EchofonCommon.notify("destroySavedSearch", {id:elem.getAttribute("ssid")});
  var c = document.getElementById("echofon-search-container");
  c.removeChild(elem);
}

function searchQueryDidSave(ss)
{
  var c = document.getElementById("echofon-search-container");
  if (c) {
    var e = document.createElement('echofon-saved-search');
    e.setAttribute("keyword", ss.query);
    e.setAttribute("ssid", ss.id);
    e.id = "echofon-saved-search-" + ss.query;
    c.appendChild(e);
  }
  var elem = $('echofon-add-search-button');
  if (elem) {
    elem.label = '-';
    elem.setAttribute('tooltiptext', EchofonCommon.getString("removeThisSavedSearch"));
  }
}

function searchQueryDidDestroy(ss)
{
  var elem = $('echofon-add-search-button');
  if (elem) {
    elem.label = '+';
    elem.setAttribute('tooltiptext', EchofonCommon.getString("saveThisSearch"));
  }
}

function onListSelected(menuitem)
{
  var acct = EchofonAccountManager.instance().get(this.activeUser());
  var list = menuitem.list;
  if (!list) {
    EchofonCommon.removeAllChild(contentBox.container);
    gActiveList = null;
    acct.setValue('list_id', 0);
    acct.save();
    EchofonCommon.notify("getListTimeline", {user_id:acct.user_id, list:null});
    return;
  }

  if (gActiveList && gActiveList.id == list.id) return;
  EchofonCommon.removeAllChild(contentBox.container);
  gActiveList = list;

  // save selected list id
  acct.setValue('list_id', list.id);
  acct.save();

  addLoadMoreCell(contentBox.getContainer('lists')).spinner = true;

  getTimeline(acct.user_id, activeTab, list);
  EchofonCommon.notify("getListTimeline", {user_id:acct.user_id, list:list});
}

function eventDidReceive(event)
{
  if (this.isActiveUser(event.source.id)) {
    // The event made by owner (favorite, retweet...)
    if (event.event == 'favorite' || event.event == 'unfavorite') {
      EchofonUtils.notifyObservers("updateFavorite", {id:event.target_object.id_str, state:event.event == 'favorite'});
    }
  }
  else {
    if (event.event == 'unfavorite') {
      var elem = document.getElementById('echofon-event-favorite-' + event.target_object.id_str);
      if (elem) {
        contentBox.container.removeChild(elem);
      }
    }
    else {
      var elem = EchofonCommon.createEventCell(event);
      var c = contentBox.getContainer('home');
      var insertPoint = c.firstChild;
      if (insertPoint.tagName == 'echofon-ad-unit') {
        insertPoint = insertPoint.nextSibling;
      }
      c.insertBefore(elem, insertPoint);
      elem.event = event;
    }
  }
}

function updateUser(user)
{
  var compose = composeBar();
  compose.user = user;
  compose.accountIcon.hidden = EchofonAccountManager.instance().numAccounts() <= 1;
}

function accountChanged(user)
{
  this.removeAllTweets();
  this.resetListMenu();
  changeTab(0);
  if (user) {
    getTimeline(user.id, activeTab);
  }
  updateUser(user);
  EchofonCommon.notify("restoreSession");
}

function updateAccountIcon()
{
  var compose = composeBar().accountIcon.hidden = EchofonAccountManager.instance().numAccounts() <= 1;
}

function authFail(data)
{
  var user = data.screen_name;
  var msg = EchofonCommon.getFormattedString("AuthFail", [user]);
  if (data.msg) {
    msg += " (" + data.msg + ")";
  }
  showMessage(msg);
  if (isActiveWindow()) {
    alertMessage(msg);
  }
}

function internalError(msg)
{
  this.showMessage(msg);
}

function APIError(msg)
{
  this.showMessage(msg);
}

function alertMessage(msg)
{
  var prompt = this.Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(this.Ci.nsIPromptService);
  prompt.alert(window, "Echofon", msg);
}

function receivedNextPage(data)
{
  var msgs = data.msgs;
  if (!msgs) return;

  var prev;
  for (var i in msgs) {
    if (msgs.hasOwnProperty(i)) {
      var elem = EchofonCommon.createMessageBalloon(this.activeUser(), msgs[i], true);
      if (!elem) continue;
      appendTweet(elem, data.type);
    }
  }
  if (msgs.length) {
    contentBox.loadMore(data.type).spinner = false;
  }
}

function removeAllTweets()
{
  contentBox.removeAllTweets();
}

function reduceTweets(c)
{
  var count = 0;
  while (c.childNodes.length > MAX_TWEETS_COUNT) {
    var e = c.lastChild;
    if (e.tagName == "echofon-load-more") e = e.previousSibling;
    if (!e.unread) {
      c.removeChild(e);
      count++;
    }
    else {
      break;
    }
  }
  if (count) {
    EchofonUtils.debug("Remove " + count + " tweets");
  }
  return count;
}

function changeTab(index)
{
  var tabName;
  if (index >= 0 && index <= 4) {
    tabName = gTabs[index];
  }
  else {
    tabName = index;
  }
  // Scroll to unread if uesr tap active tab
  if (tabName == activeTab) {
    this.jumpToUnread();
    return;
  }

  //EchofonGA.instance().trackPage("/" + tabName);

  markRead();
  var reduced = reduceTweets(contentBox.getContainer(activeTab));
  var border = document.getElementById('echofon-unread-border-' + activeTab);
  removeUnreadBorder(border, activeTab);

  if (activeTab == 'search') {
    composeBar().textbox.focus();
  }

  activeTab = tabName;
  contentBox.activeTab = activeTab;
  $(tabName + "Button").checked = true;

  // tweak toolbar
  $('echofon-list-bar-container').hidden = activeTab != 'lists';
  $('echofon-search-bar-container').hidden = activeTab != 'search';

  if (activeTab == 'lists') buildListMenu();
  if (activeTab == 'search') {
    if (gActiveQuery) {
      var sc = document.getElementById("echofon-search-container");
      if (sc) sc.parentNode.removeChild(sc);
      document.getElementById("echofon-search-text-box").value = gActiveQuery;
    }
    else {
      buildSearchMenu();
    }
    $('echofon-search-text-box').focus();
  }

  if (contentBox.container.childNodes.length == 0) {
    getTimeline(this.activeUser(), activeTab);
  }
  updateTimestamp();
  this.onresizeWindow();

  adIsVisible(index == 0);
}

function nextTab(advance)
{
  var win = getMainWindowFromSidebar();
  if (gAppMode == "panel" && !win.EchofonOverlay.isPanelOpened()) return;

  var toolbar = $('echofon-toolbar');
  changeTab(toolbar.getNextTab(advance));
}

function retweeted(tweet)
{
  for (var i = 0; i < contentBox.container.childNodes.length; ++i) {
    // check the element is already in the container
    if (contentBox.container.childNodes[i].getAttribute("messageId") == tweet.id) {
      var e = contentBox.container.childNodes[i];
      e.doRetweet(tweet);
    }
  }
}

function undoRetweet(tweet)
{
  for (var i = 0; i < contentBox.container.childNodes.length; ++i) {
    // check the element is already in the container
    if (contentBox.container.childNodes[i].getAttribute("messageId") == tweet.id) {
      var e = contentBox.container.childNodes[i];
      e.undoRetweet(tweet);
    }
  }
}

function failedToRetweet(tweet)
{
  showMessage("Failed to retweet: " + tweet.full_text);
}

function tweetDidSend(tweet)
{
  var elem = EchofonCommon.createMessageBalloon(this.activeUser(), tweet, true);
  if (elem && tweet.type == 'home') {
    this.insertTweet(elem, contentBox.getContainer(tweet.type));
    this.showMessage();
  }
}

function failedToSendMessage(context)
{
  var elem = composeBar();
  if (elem && elem.timestamp == context.timestamp) {
    elem.textbox.value = context.status;
    showMessage(context.error, "WARN");
  }
}

function didGetPlaces(places)
{
  var elem = composeBar();
  if (elem) {
    elem.places = places;
  }
  else {
    EchofonCommon.composePanel().places = places;
  }
}

function markRead()
{
  var border = document.getElementById('echofon-unread-border-' + activeTab);
  if (border) {
    border.unread = false;
  }

  var c = contentBox.getContainer();
  for (var i =0 ; i < c.childNodes.length; ++i) {
    var e = c.childNodes[i];
    if (e == null) continue;
    if (e.tagName != "echofon-status") continue;
    e.unread = false;
  }

  EchofonCommon.notify("markRead", {user_id:this.activeUser(), type: activeTab});
  EchofonCommon.notifyObservers("setUnreadCount", -gUnreadCount[activeTab]);
  markReadToolbar();
  gUnreadCount[activeTab] = 0;
  setUnreadCountToTitleBar();
}

function panelClosed()
{
  var popup = $("echofon-tweet-popup");
  if (popup) popup.hidePopup();

  markRead();
  var border = document.getElementById('echofon-unread-border-' + activeTab);
  if (border) {
    removeUnreadBorder(border, activeTab);
  }

  for (var i in gTabs) {
    reduceTweets(contentBox.getContainer(gTabs[i]));
  }

  /*
  var box = contentBox.scrollbox.scrollTo(0, 0);
  activeTab = 'home';
  contentBox.activeTab = activeTab;
  $(activeTab + "Button").checked = true;
  */
}

function markReadToolbar(tab)
{
  if (!tab) tab = activeTab;
  if (!tab) return;
  var toolbar = $('echofon-toolbar');
  toolbar.setUnread(tab, false);
  if (!toolbar.hasUnread()) {
    EchofonCommon.notifyObservers("setButtonState", "inactive");
  }
}

function openPreferences(event)
{
  if (this._prefWindow) {
    this._prefWindow.focus();
    return true;
  }

  return true;
}

function changeAccount(user_id)
{
  var currentUser = activeUser();

  if (user_id != currentUser) {
    gActiveList = null;
    gActiveQuery = null;
    if (gLoadMoreTimer) {
      gLoadMoreTimer.cancel();
      gLoadMoreTimer = null;
    }
    // Close balloon and popup window, reset window settings
    this.removeAllTweets();
    EchofonCommon.notify("changeAccount", {user_id:user_id});
  }
}

function mute(val, type)
{
  EchofonSync.instance().mute(this.activeUser(), val, type);
}

//
// sync
//
function updateSyncData(data)
{
  if (!this.isActiveUser(data.user_id)) return;

  var sync = data.data['sync'];

  var keys = {home:'timeline', mentions:'replies'};
  for (var tab in keys) {
    var border = document.getElementById('echofon-unread-border-' + tab);
    if (border && border.unread) {
      var id =sync[keys[tab]];
      var elem = document.getElementById("echofon-status-" + tab + "-" + id);
      if (elem) {
        if (EchofonModel.DBM._64bitsub(id, border.nextSibling.getAttribute("messageId")) <= 0) continue;

	var c = contentBox.getContainer(tab);
        border.previousSibling.setAttribute("border", false);
	c.removeChild(border);

	if (EchofonModel.DBM._64bitsub(id, c.firstChild.getAttribute("messageId")) < 0) {
          c.insertBefore(border, elem);
          border.previousSibling.setAttribute("border", true);
          if (tab == activeTab && !isActiveWindow()) {
            this.jumpToUnread(true);
	  }
	}
	else {
	  markReadToolbar(tab);
	  if (tab == activeTab && !isActiveWindow()) {
            contentBox.scrollbox.ensureElementIsVisible(elem);
	  }
	}
	// mark read old tweets
	while (elem && elem.unread) {
	  elem.unread = false;
	  elem = elem.nextSibling;
	}
      }
    }
  }
}

function markReadBySync(data)
{
  for (var key in data) {
    gUnreadCount[key] -= data[key];
  }
  setUnreadCountToTitleBar();
}

//
// Commands
//
function newTweet()
{
  var text = $('echofon-textbox');
  if (text) text.focus();
}

function jumpToUnread(noMarkRead)
{
  var border = document.getElementById('echofon-unread-border-' + activeTab);
  if (border) {
    var c = contentBox.getContainer(activeTab);

    var box = contentBox.scrollbox;
    var boxHeight = parseInt(window.getComputedStyle(c, null).height);

    var height = 0;
    for (var i = 0; i < c.childNodes.length; ++i) {
      var e = c.childNodes[i];
      var h = parseInt(window.getComputedStyle(e, null).height);
      if (!isNaN(h)) height += h+1;
      if (e.tagName == "echofon-unread-border") {
        if (e.nextSibling) {
          h = parseInt(window.getComputedStyle(e.nextSibling, null).height);
          if (!isNaN(h)) height += h;
        }
        height -= 1;
        var y = 0;
        if (height - boxHeight > 0) {
          y = height - boxHeight;
        }
        if (noMarkRead) {
          gNoMarkUnread = true;
        }
        box.scrollTo(0, y);
        return true;
      }
    }
  }
  return false;
}

function openPreference()
{
  EchofonCommon.openPreferences();
}

//
// Tweet menu
//

function addImage()
{
  var elem = composeBar();
  if (elem) elem.addImage();
}

function addGeoLocation()
{
  var elem = composeBar();
  if (elem) elem.addGeoLocation();
}

function insertURL()
{
  var elem = composeBar();
  if (elem) elem.insertURL();
}

function aboutEchofon()
{
  window.openDialog("chrome://echofon/content/about.xul", "echofon:about", "dialog=yes,centerscreen=yes,chrome,resizable=no");
}

function openJSConsole()
{
  var pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("javascript.options.");
  pref.setBoolPref("showInConsole", true);
  pref.setBoolPref("strict", true);
  EchofonCommon.pref().setBoolPref("debug", true);
  window.openDialog("chrome://global/content/console.xul", "global:console");
}

function openAboutConfig()
{
  window.openDialog("chrome://global/content/config.xul");
}

function checkUpdate()
{
  var checker = Cc["@mozilla.org/updates/update-prompt;1"].createInstance(Ci.nsIUpdatePrompt);
  checker.checkForUpdates();
}

function updateFont()
{
    this.removeAllTweets();
    getTimeline(this.activeUser(), activeTab);
}

function OAuthSignerError(msg) {
  if (!EchofonCommon.isXULRunner()) return;

  alert("Echofon does not support this platform or custom build Firefox. (Can't get OAuth signer.) / " + msg + " - " + navigator.oscpu);
}

function failedToAuth(obj)
{
  if (!EchofonCommon.isXULRunner()) return;

  this.showMessage(obj.message);
  var account = EchofonAccountManager.instance().get(this.activeUser());
  if (account.needToAlertOAuthError()) {
    alert(EchofonCommon.getFormattedString("AuthFail", [obj.screen_name]) + " (" + obj.message  + ")");
    EchofonCommon.startOAuth(obj.screen_name, window);
  }
}

function needToReAuth(screen_name)
{
  if (!EchofonCommon.isXULRunner()) return;
  if (gAskedToReAuth) return;
  gAskedToReAuth = true;

  alert("You need to reauthorize with Twitter in order for Echofon to access your account. This is due to a change Twitter made in their authorization system for apps.");
  EchofonCommon.startOAuth(screen_name, window);
}

function onFinishOAuth(user_id) {
  var account = EchofonAccountManager.instance().get(user_id);
  if (EchofonCommon.pref().getCharPref("activeUserIdStr") == '') {
    EchofonCommon.pref().setCharPref("activeUserIdStr", account.user_id);
  }
  EchofonCommon.reloadTimeline();
}

//
// Ads
//

function adDidLoad(content)
{
  var ad = $('echofon-ad-unit');
  if (ad) {
     ad.ad = content.ads[0];
     if (g140Timer) g140Timer.cancel();
     g140Timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
     g140Timer.initWithCallback({notify: function() { reloadAd(); }}, AD_INTERVAL_TIME, Ci.nsITimer.TYPE_ONE_SHOT);
  }
}

function reloadAd()
{
  g140Timer = null;
  if (!gIsAdVisible || gIdleObserver.idle == "idle") {
    gNeedToReloadAd = true;
    return;
  }

  if ($('echofon-ad-unit')) {
    EchofonCommon.notify("getAd", {user_id:this.activeUser(), force:true});
  }
  gNeedToReloadAd = false;
}

function failedToLoadAd(reason)
{
  var ad = $('echofon-ad-unit');
  if (ad) {
    if (g140Timer) g140Timer.cancel();
    g140Timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    g140Timer.initWithCallback({notify: function() { reloadAd(); }}, 30 * 1000, Ci.nsITimer.TYPE_ONE_SHOT);
  }
}

function statsFor140Ads(url)
{
  var req = new XMLHttpRequest();
  req.open("GET", url, true);
  req.send(null);
}

function replyOn140Ad(obj)
{
  var tweet = {id:obj.status.id_str, id_str:obj.status.id_str, text:obj.full_text, user:obj.user};
  reply(null, tweet, obj.action_urls.reply_url);
  statsFor140Ads(obj.action_urls.reply_intent_url);
}

function retweetOn140Ad(obj)
{
  var prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
  var ret = prompt.confirm(window, "Echofon", EchofonCommon.getFormattedString("ConfirmRetweet", [obj.full_text]));
  if (ret) {
    EchofonCommon.notify("retweet", {id:obj.status.id_str});
    statsFor140Ads(obj.action_urls.retweet_url);
  }
  return ret;
}

function favoriteOn140Ad(obj)
{
  EchofonCommon.notify("setFavorite",{id: obj.status.id_str, method:'create'});
  statsFor140Ads(obj.action_urls.favorite_url);
}

function addAds()
{
  if (!EchofonCommon.pref().getBoolPref('licensed')) {
    if ($('echofon-ad-unit') == null) {
      var ad = document.createElement('echofon-ad-unit');
      ad.id = 'echofon-ad-unit';
      var c = contentBox.getContainer('home');
      c.insertBefore(ad, c.firstChild);
      EchofonCommon.notify("getAd", {user_id:this.activeUser(), force:false});
    }
  }
}

function onBadgeMenuOpening()
{
  if (EchofonCommon.pref().getBoolPref("licensed")) {
    removePurchaseMenu();
  }
}

function removeAds()
{
  var ad = $('echofon-ad-unit');
  if (ad) {
    ad.parentNode.removeChild(ad);
  }
  removePurchaseMenu();
}

function removePurchaseMenu()
{
  var m = $('menu_purchase');
  if (m) {
    var p = m.parentNode;
    if (m.nextSibling.tagName == "menuseparator") {
      p.removeChild(m.nextSibling);
    }
    p.removeChild(m);
  }
}

//
// Other utilities
//
function activeUser()
{
  return EchofonCommon.pref().getCharPref("activeUserIdStr");
}

function activeUserName()
{
  var account = EchofonAccountManager.instance().get(this.activeUser());
  return account.screen_name;
}

function isActiveUser(user_id)
{
  return user_id == this.activeUser();
}

function notifyStatusToWindows(sts, obj)
{
  var msg = {"state": sts, "data": obj};
  var data = JSON.stringify(msg);
  Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService).notifyObservers(null, "echofon-status", data);
}

function isActiveWindow()
{
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  var win = wm.getMostRecentWindow("");
  return win == window;
}

function $(name)
{
  return this.document.getElementById(name);
}

window.addEventListener("load",         function(e) { onloadWindow(e);         }, false);
window.addEventListener("unload",       function(e) { onunloadWindow(e);       }, false);
window.addEventListener("beforeunload", function(e) { onbeforeunloadWindow(e); }, false);
window.addEventListener("focus",        function(e) { onfocusWindow(e);        }, false);
window.addEventListener("blur",         function(e) { onblurWindow(e);         }, false);
window.addEventListener("resize",       function(e) { onresizeWindow(e);       }, false);
window.addEventListener("activate",     function(e) { onActivateWindow(e);     }, false);
window.addEventListener("deactivate",   function(e) { onDeactivateWindow(e);   }, false);
