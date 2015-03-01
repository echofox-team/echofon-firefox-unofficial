//
// Implementation of Echofon user window methods
//
// Copyright (c) 2009-2011 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

//
// const and window local variables.
//
Components.utils.import("resource://echofon/Account.jsm");
Components.utils.import("resource://echofon/TwitterClient.jsm");
Components.utils.import("resource://echofon/Models.jsm");
Components.utils.import("resource://echofon/EchofonUtils.jsm");
Components.utils.import("resource://echofon/EchofonSync.jsm");
//Components.utils.import("resource://echofon/EchofonGA.jsm");

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

var currentContainer = 'tweets';
var currentUserContainer = 'tweets';
var currentListContainer = 'following-list';
var account = null;
var gUser = null;
var gRelationship = null;

//
// Initializer
//
function onload()
{
  this._observer = new echofonObserver();

  account = EchofonAccountManager.instance().get();

  var URI = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(window.location, null, null);
  var aURL = URI.QueryInterface(Ci.nsIURL);

  if (aURL.query) {
    var params = EchofonCommon.parseURLQuery(aURL.query);
  }
  else {
    var params = EchofonCommon.parseURLQuery(window.arguments[0]);
  }

  if (!params.screen_name) {
    $('user-name').value = EchofonCommon.getString("NoUser");
    return;
  }

  gUser = EchofonModel.User.findByScreenName(params.screen_name, account.user_id);
  if (gUser) {
    this.setUser(gUser);
  }
  else {
    gUser = {screen_name:params.screen_name};
  }

  updateUserTimeline(params.screen_name);

  //EchofonGA.instance().trackPage("/user");
  $('follow_button').className = "echobutton following";
  $('follow_button').label = EchofonCommon.getString("Loading");
}

function updateUserTimeline(screen_name)
{
  var c = container('tweets');
  EchofonCommon.removeAllChild(c);

  addLoadMoreCell('tweets');

  var req = new TwitterClient(account, this);
  req.get("statuses.user_timeline", {screen_name:screen_name,
                                     include_entities:true,
                                     include_rts:true});

  if (gUser.screen_name.toLowerCase() == account.screen_name.toLowerCase()) {
    $('follow_area').hidden = true;
    return;
  }
  $('follow_area').hidden = false;


  var req2 = new TwitterClient(account, this);
  req2.get("friendships.show", {source_screen_name:account.screen_name,
                                target_screen_name:gUser.screen_name});
}

function addLoadMoreCell(tab)
{
  var cell = document.getElementById('echofon-load-more-' + tab);
  if (!cell) {
    cell = document.createElement("echofon-load-more");
    cell.id = 'echofon-load-more-' + tab;
    container(tab).appendChild(cell);
  }
  cell.spinner = true;
  return cell;
}

function onunload()
{
  this._observer.remove();
}

function accountChanged(user)
{
  account = EchofonAccountManager.instance().get();
  updateUserTimeline(gUser.screen_name);
}

//
// commands
//
function replyToUser()
{
  var text = '@' + gUser.screen_name + ' ';
  var parent = document.getElementById('user-name');
  EchofonCommon.openComposeWindow(parent, text);
}

function directMessageToUser()
{
  var text = 'd ' + gUser.screen_name + ' ';
  var parent = document.getElementById('user-name');
  EchofonCommon.openComposeWindow(parent, text);
}

function onScrollBox()
{
  var type = currentContainer;
  var box = getScrollBoxObject();
  var y = {};
  var height = {};
  box.getPosition({}, y);
  box.getScrolledSize({}, height);
  if (y.value + box.height >= (height.value-3)) {

    var loadmore = container().lastChild;
    if (loadmore.spinner) return;
    if (loadmore.noMoreTweet) return;

    loadmore.spinner = true;
    var req = new TwitterClient(account, this);



    switch (type) {
      case 'tweets':
        var max_id =EchofonModel.DBM._64bitadd(loadmore.maxId, -1);
        req.get("statuses.user_timeline", {user_id:gUser.id,
                                           include_entities:true,
                                           include_rts:true,
                                           max_id:max_id});
        break;
      case 'favorites':
        var max_id =EchofonModel.DBM._64bitadd(loadmore.maxId, -1);
        req.get("favorites", {user_id:gUser.id,
                              include_entities:true,
                              max_id:max_id});
        break;

      case 'friends':
      case 'followers':
        req.get("statuses." + currentContainer, {user_id:gUser.id, cursor:loadmore.nextCursor});
        break;
      case 'following-list':
        req.get("lists.all", {screen_name:gUser.screen_name}, 'following_list');
        break;
      case 'followed-list':
        req.get("lists.memberships", {screen_name:gUser.screen_name, cursor:loadmore.nextCursor}, 'followed_list');
        break;
    }
  }
}

function changeTab(type)
{
  if (currentContainer == type) return;

  $('echofon-' + currentContainer).collapsed = true;

  switch (type) {
    case 'user':
      type = currentUserContainer;
      $('user-sub-tabs').hidden = false;
      $('list-sub-tabs').hidden = true;
      break;

    case 'lists':
      type = currentListContainer;
      $('user-sub-tabs').hidden = true;
      $('list-sub-tabs').hidden = false;
      break;

    case 'favorites':
      $('user-sub-tabs').hidden = true;
      $('list-sub-tabs').hidden = true;
      break;

    case 'tweets':
    case 'friends':
    case 'followers':
      currentUserContainer = type;
      break;

    case 'following-list':
    case 'followed-list':
      currentListContainer = type;
      break;
  }

  $('echofon-' + type).collapsed = false;
  currentContainer = type;

  var arr = window.location.toString().split('#');
  var loc = arr[0] + '#' + currentContainer;
  window.location.assign(loc);

  // load tab content

  if (container().childNodes.length == 0) {
    addLoadMoreCell(currentContainer);

    var req = new TwitterClient(account, this);
    switch (currentContainer) {
      case 'favorites':
        req.get("favorites", {user_id:gUser.id, include_entities:true});
        break;
      case 'friends':
      case 'followers':
        req.get("statuses." + currentContainer, {user_id:gUser.id, cursor:-1});
        break;
      case 'following-list':
        req.get("lists.all", {screen_name:gUser.screen_name}, 'following_list');
        break;
      case 'followed-list':
        req.get("lists.memberships", {screen_name:gUser.screen_name}, 'followed_list');
        break;
    }
  }
}

function shortenURLDidExpand(param)
{
  var link = document.getElementById(param.messageId + "-" + param.originalURL);
  if (link) {
    link.setAttribute("href", param.url);
    var elem = document.getElementById(param.messageId);
    elem.setAttribute("_tooltiptext", param.url);
  }
}

function container(type)
{
  if (type) {
    return $('echofon-' + type);
  }
  else {
    return $('echofon-' + currentContainer);
  }
}

function getScrollBoxObject()
{
  return $('scroll-container').boxObject.QueryInterface(Components.interfaces.nsIScrollBoxObject);
}

function onActionMenuShowing()
{
}

var gListRequested = false;

function onListMenuShowing()
{
  var lists = EchofonModel.List.loadAll(account.user_id);
  if (lists.length == 0) {
    if (!gListRequested) {
      var req = new TwitterClient(account, this);
      req.get("lists.all");
    }
  }
  else {
    buildListMenu(lists);
  }
  gListRequested = true;
}

var gListSubscription = null;

function buildListMenu(lists)
{
  if (gListSubscription == null) {
    var req = new TwitterClient(account, this);
    req.get("lists.memberships", {user_id:gUser.id, filter_to_owned_lists:true});
    return;
  }

  var menu = $('userListMenu');
  while (menu.firstChild) menu.removeChild(menu.firstChild);

  if (lists.length == 0) {
    var menuitem = document.createElement('menuitem');
    menuitem.setAttribute('type', 'checkbox');
    menuitem.setAttribute('label', "You have no list");
    menuitem.setAttribute('disabled', 'true');
    menu.appendChild(menuitem);
  }

  for (var i in lists) {
    var list = lists[i];
    if (list.user.id == account.user_id) {
      var menuitem = document.createElement('menuitem');
      menuitem.list = list;
      menuitem.id = 'list-menuitem-' + list.id;
      menuitem.setAttribute('type', 'checkbox');
      menuitem.setAttribute('label', list.name);
      menuitem.addEventListener("command", function() {addToList(this)}, false);

      if (gListSubscription[list.id]) {
        menuitem.setAttribute("checked", true);
        menuitem.subscribed = true;
      }
      menu.appendChild(menuitem);
    }
  }
}

function lists_memberships(obj, req, context)
{
  gListSubscription = {};
  for (var i in obj.lists) {
    var list = obj.lists[i];
    gListSubscription[list.id] = list;
  }
  buildListMenu(EchofonModel.List.loadAll(account.user_id));
}

function addToList(elem)
{
  var list = elem.list;
  var req = new TwitterClient(account, this);
  var method = list.user.screen_name + '/' + list.id + '/members';
  req.list = list;
  if (elem.subscribed) {
    req.post(method, {id:gUser.id, _method:"DELETE"}, 'list_deleted');
  }
  else {
    req.post(method, {id:gUser.id}, 'list_added');
  }
}

function list_added(obj, req, context)
{
  gListSubscription[context.list.id] = context.list;
}

function list_deleted(obj, req, context)
{
  delete gListSubscription[context.list.id];
}

//
// TwitterAPI callbacks
//
function statuses_user_timeline(obj, req, context)
{
  var c = container('tweets');
  var loadmore = c.lastChild;
  loadmore.spinner = false;
  if (Number(req.status) == 404) {
    $('user-name').value = EchofonCommon.getString("userNotFound");
  }
  else if (Number(req.status) == 401) {
    $('protected_user_area').hidden = false;
    $('protected_user_detail').appendChild(document.createTextNode(EchofonCommon.getFormattedString('userIsProtected', [gUser.screen_name])));
    $('user_details_area').style.display = "none";
    req = new TwitterClient(account, this);
    req.get("users.show", {screen_name:gUser.screen_name});
  }
  else if (obj) {
    if (obj.length == 0) {
      loadmore.noMoreTweet = true;
      if (!gUser.user_id) {
        req = new TwitterClient(account, this);
        req.get("users.show", {screen_name:gUser.screen_name});
      }
      return;
    }
    var style = window.getComputedStyle(c, null);

    var max_id = 0;

    for (var i in obj) {
      var status = new EchofonModel.Status(obj[i], 'user-timeline', account.user_id);
      if (gUser.id == null && gUser.screen_name.toLowerCase() == status.user.screen_name.toLowerCase()) {
        gUser = status.user;
        setUser(gUser);
      }

      var elem = EchofonCommon.createMessageBalloon(account.user_id, status, true);
      if (!elem) continue;
      elem.appMode = "window";
      elem.containerWidth = parseInt(style.width);
      elem.setAttribute('user-timeline', true);
      c.insertBefore(elem, loadmore);
      max_id = obj[i].id;
    }
    loadmore.maxId = max_id;
  }
}

function users_show(obj, req, context) {
  if (obj) {
    gUser = new EchofonModel.User(obj, account.user_id);
    setUser(gUser);
  }
}

function insertFriends(obj, container)
{
  var loadmore = container.lastChild;
  loadmore.spinner = false;
  loadmore.nextCursor = obj.next_cursor_str;
  if (obj.next_cursor == 0) {
    loadmore.noMoreTweet = true;
  }
  for (var i in obj.users) {
    var elem = document.createElement('echofon-user');
    container.insertBefore(elem, loadmore);
    elem.user = obj.users[i];
  }
}

function statuses_friends(obj, req, context)
{
  if (!obj) {
    return;
  }
  insertFriends(obj, container('friends'));
}

function insertLists(lists, container, loadmore)
{
  for (var i in lists) {
    var elem = document.createElement('echofon-list');
    container.insertBefore(elem, loadmore);
    elem.list = lists[i];
  }
}

function following_list(obj, req, context) {
  if (!obj) {
    return;
  }

  var c = container('following-list');

  var loadmore = c.lastChild;
  loadmore.spinner = false;
  loadmore.noMoreTweet = true;
  insertLists(obj.reverse(), c, loadmore);
}

function followed_list(obj, req, context) {
  if (!obj) {
    return;
  }

  var c = container('followed-list');
  var loadmore = c.lastChild;
  loadmore.spinner = false;
  loadmore.nextCursor = obj.next_cursor_str;
  if (obj.next_cursor == 0) {
    loadmore.noMoreTweet = true;
  }
  insertLists(obj.lists, c, loadmore);
}

function statuses_followers(obj, req, context)
{
  if (!obj) {
    return;
  }

  insertFriends(obj, container('followers'));
}

function favorites(obj, req, context)
{
  var c = container('favorites');
  var loadmore = c.lastChild;
  loadmore.spinner = false;

  if (!obj) {
    return;
  }
  if (obj.length == 0) {
    loadmore.noMoreTweet = true;
    return;
  }

  var style = window.getComputedStyle(c, null);
  for (var i in obj) {
    var status = new EchofonModel.Status(obj[i], 'favorites', account.user_id);
    var elem = EchofonCommon.createMessageBalloon(account.user_id, status, true);
    if (!elem) continue;
    elem.appMode = "window";
    elem.containerWidth = parseInt(style.width) - 16;
    c.insertBefore(elem, c.lastChild);
  }
  loadmore.maxId = obj[obj.length-1].id;
}

function lists_all(obj, req, context)
{
  if (obj) {
    var ret = [];
    for (var i in obj) {
      var list = new EchofonModel.List(obj[i], account.user_id);
      list.insertIntoDB();
      ret.push(list);
    }
    buildListMenu(ret);
  }
  else {
    gListRequested = false;
  }
}

function friendships_show(obj, req, context)
{
  if (obj) {
    gRelationship = obj.relationship;
    updateMenu(obj.relationship.source);
  }
}

function updateMenu(source)
{
  $('mute-menu').label = EchofonCommon.getFormattedString(EchofonSync.instance().isMutedUser(account.user_id, gUser.screen_name) ? "unmuteUser" : "muteUser", [gUser.screen_name]);
  if (!source) return;

  if (gUser.id == account.user_id) {
    $('user-action-menu').setAttribute("menu", "ownMenu");
  }
  else {
    $('user-action-menu').setAttribute("menu", "userActionMenu");
  }

  $('send-dm').disabled = source.can_dm ? false : true;
  $('report-spam-menu').disabled = source.marked_spam ? true : false;
  $('block-menu').label = EchofonCommon.getFormattedString((source.blocking) ? 'unblockUser' : 'blockUser', [gUser.screen_name]);
  if (source.following) {
    $('no-retweet').hidden = false;
    $('no-retweet').label = EchofonCommon.getFormattedString((source.want_retweets) ? 'noRetweet' : 'enableRetweet', [gUser.screen_name]);
    $('mute-menu').hidden = false;
    $('extra-separator').hidden = false;
  }
  else {
    $('no-retweet').hidden = true;
    $('mute-menu').hidden = true;
    $('extra-separator').hidden = true;
  }

  if (!gUser.follow_request_sent) {
    $('follow_button').className = source.following ? "echobutton following" : "echobutton";
    if (gUser.protected && source.following == false) {
      $('follow_button').label = EchofonCommon.getString("sendFollowRequest");
    }
    else {
      $('follow_button').label = EchofonCommon.getString(source.following ? "following" : "follow");
    }
  }
  else {
    $('follow_button').className = "follow-request-sent";
    $('follow_button').label = EchofonCommon.getString("followRequestSent");
  }
  $('follow_button').disabled = false;

  $('follow_status').value = EchofonCommon.getFormattedString((source.followed_by) ? 'userIsFollowing' : 'userIsNotFollowing', [gUser.screen_name, account.screen_name]);
  var w = parseInt(window.getComputedStyle($('follow_button'), null).width);
  $('follow_status').style.width = (458 - 10 - w - 18) + 'px';
}

//
// mute, follow & blocking
//

function mute()
{
  if (EchofonSync.instance().isMutedUser(account.user_id, gUser.screen_name)) {
    EchofonSync.instance().unmute(account.user_id, gUser.screen_name, 'user');
  }
  else {
    EchofonSync.instance().mute(account.user_id, gUser.screen_name, 'user');
  }
}

function updateSyncData(data)
{
  updateMenu();
}

function follow()
{
  var req = new TwitterClient(account, this);
  if (gUser.follow_request_sent) {
    req.post("friendships.destroy", {user_id:gUser.id});
  }
  else {
    if (gRelationship.source.following) {
      req.post("friendships.destroy", {user_id:gUser.id});
    }
    else {
      req.post("friendships.create", {user_id:gUser.id});
    }
  }

  $('follow_button').label = EchofonCommon.getString("Loading");
  $('follow_button').disabled = true;
}

function onHoverFollowingButton(flag)
{
  if (gRelationship.source.following) {
    $('follow_button').label = EchofonCommon.getString(flag ? 'unfollow' : 'following');
  }
}

function friendships_create(obj, req, context)
{
  if (obj) {
    gRelationship.source.following = true;
    gRelationship.source.blocking = false;
    gRelationship.source.marked_spam = false;
    if (gUser.protected) gUser.follow_request_sent = true;
    updateMenu(gRelationship.source);
    EchofonModel.User.follow(obj.id, account.user_id);
  }
  else {
    EchofonCommon.alertMessage(null, context._errorMessage);
  }
}

function friendships_destroy(obj, req, context)
{
  if (obj) {
    gRelationship.source.following = false;
    updateMenu(gRelationship.source);
    EchofonModel.User.unfollow(obj.id, account.user_id);
  }
  else {
    EchofonCommon.alertMessage(null, context._errorMessage);
  }
}

function blockUser(type)
{
  if (gRelationship.source.blocking) {
    EchofonCommon.notify("unblockUser", {user_id:gUser.id});
  }
  else {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    var ret = prompt.confirm(window, "Echofon", EchofonCommon.getFormattedString("Confirm" + type, [gUser.screen_name]));
    if (ret) {
      EchofonCommon.notify("blockUser", {user_id:gUser.id, type:type});
    }
  }
}

function didBlockUser(user)
{
  if (gUser.id != user.id) return;
  gRelationship.source.can_dm = false;
  gRelationship.source.blocking = true;
  gRelationship.source.followed_by = false;
  gRelationship.source.following = false;
  updateMenu(gRelationship.source);
}

function didReportSpam(user)
{
  if (gUser.id != user.id) return;
  gRelationship.source.can_dm = false;
  gRelationship.source.blocking = true;
  gRelationship.source.followed_by = false;
  gRelationship.source.following = false;
  gRelationship.source.marked_spam = true;
  updateMenu(gRelationship.source);
}

function didUnblockUser(user)
{
  if (gUser.id != user.id) return;
  gRelationship.source.blocking = false;
  gRelationship.source.marked_spam = false;
  updateMenu(gRelationship.source);
}

function noRetweet()
{
  var req = new TwitterClient(account, this);
  if (gRelationship.source.want_retweets) {
    req.post("friendships.update", {user_id:gUser.id, retweets:false});
  }
  else {
    req.post("friendships.update", {user_id:gUser.id, retweets:true});
  }
}

function friendships_update(resp, req, context)
{
  if (resp) {
    resp.relationship.source.want_retweets = context._params.retweets;
    gRelationship = resp.relationship;
    updateMenu(gRelationship.source);
    if (gRelationship.source.want_retweets) {
      EchofonModel.NoRetweet.destroy(account.user_id, gRelationship.target.id_str);
    }
    else {
      EchofonModel.NoRetweet.create(account.user_id, gRelationship.target.id_str);
    }
  }
}

//
//
//
function setUser(user)
{
  window.document.title = '@' + user.screen_name + " - Echofon";
  for (var key in user) {
    var e = $('user-' + key);
    if (e) {
      e.value = user[key];
    }
  }
  $('user-url-link').setAttribute("target", user.url);
  if (user.url) {
    $('user-url-link').onclick = function() {EchofonCommon.openURL(user.url)};
  }
  $('user-link').setAttribute("target", EchofonCommon.twitterURL(user.screen_name));
  $('user-link').onclick = function() {EchofonCommon.openURL(EchofonCommon.twitterURL(user.screen_name))};
  $('user-icon').src = user.profileImageUrl128();
  $('user-icon').href = user.profileImageUrlFull();

  var keys = ['statuses_count', 'friends_count', 'followers_count'];
  for (var i in keys) {
    var key = keys[i];
    $('user-' + key).label = EchofonCommon.getFormattedString(key, [user[key]]);
  }
  $('user-followed-lists').label = EchofonCommon.getFormattedString('listed_count', [user['listed_count']]);
  $('user-description-multiline').appendChild(document.createTextNode(user.description));
}

function $(name) {return this.document.getElementById(name);}
