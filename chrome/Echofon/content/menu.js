//
// Popup menu and tooltip for tweet cell
//

function menuPopup()
{
  return $('echofon-menu-popup');
}

function echofonPopupMenuShowing(menu)
{
  var items = menu.firstChild;
  if (items.tagName == 'echofon-tweet-cell-menu') {
    var tweet = menu.target;
    if (!tweet.getAttribute('text').match(/@[A-Za-z0-9_]+/g)) {
      items.item('replyAll').disabled = true;
    }
    if (tweet.getAttribute("protected") == 1) {
      items.item('retweet').disabled = true;
      items.item('rtComment').disabled = true;
      var tooltip = EchofonCommon.getString("CantRetweetProtectedUsersTweet")
      items.item('retweet').setAttribute("tooltiptext", tooltip);
      items.item('rtComment').setAttribute("tooltiptext", tooltip);
    }
    else {
      items.item('retweet').label = EchofonCommon.getString((tweet.getAttribute('is_own_retweet') ? "undoRetweet" : "doRetweet"));
      items.item('rtComment').disabled = false;
      items.item('retweet').removeAttribute("tooltiptext");
      items.item('rtComment').removeAttribute("tooltiptext");
    }

    if (tweet.getAttribute('type') == 'messages') {
      items.item('delete').disabled = false;
      items.item('retweet').disabled = true;
      items.item('rtComment').disabled = true;
      items.item('replyAll').disabled = true;
    }
    if (tweet.getAttribute('is_own_tweet')) {
      items.item('delete').disabled = false;
    }
  }
}

function echofonPopupMenuHiding(menu)
{
  menu.user = null;
}

function showUserProfileTooltip(event)
{
  var user = document.tooltipNode.user;
  if (!user.name) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (menuPopup().state == 'open') return;

  var c = $('echofon-user-tooltip-container');
  while (c.firstChild) c.removeChild(c.firstChild);

  var profile = document.createElement("profile-tooltip-text");

  var name = document.createElement('description');
  name.className = "echofon-profile-tooltip-name";
  name.appendChild(document.createTextNode(user.name));
  profile.appendChild(name);


  var pmsg =
    ((user.location) ? user.location + "\n" : "") +
    ((user.url) ? user.url + "\n" : "") +
    ((user.followers_count) ? user.followers_count + " followers\n" : "") +
    ((user.friends_count) ? user.friends_count + " following\n" : "") +
    ((user.statuses_count) ? user.statuses_count + " updates" : "");

  profile.appendChild(document.createTextNode(pmsg));
  c.appendChild(profile);

  var tooltip = $("echofon-user-tooltip");
  tooltip.openPopup(document.tooltipNode, "after_pointer", 16, -16, false, false, event);
}

function userProfileIconMenu(user, event)
{
  var menu = menuPopup();
  while (menu.firstChild) menu.removeChild(menu.firstChild);
  var items = document.createElement('echofon-user-icon-menu');
  menu.user = user;
  menu.appendChild(items)
  menu.openPopupAtScreen(event.screenX, event.screenY, true);
}


function showTweetTooltip(event)
{
  if (menuPopup().state == 'open') return;

  var c = $('echofon-tooltip-container');
  while (c.firstChild) c.removeChild(c.firstChild);

  var link = null;

  var target = document.tooltipNode;

  var link = target.getAttribute('expanded_url');
  if (!link) {
    link = target.getAttribute("href");
    if (link && target.getAttribute('type') == "link") {
      target.id = this.id + "-" + link;
      Components.utils.import("resource://echofon/bitly.jsm");
      link = Bitly.getDecodedTinyURL(link, this.id);
    }
  }
  if (link) {
    var text = document.createElement("label");
    text.className = "echofon-link-tooltip";
    text.setAttribute("value", link);
    c.appendChild(text);

    var tooltip = $("echofon-tooltip");
    tooltip.openPopup(event.originalTarget, "after_pointer", 16, -16, false, false, event);
  }
}

function shortenURLDidExpand(param)
{
  var tooltiptext = $("echofon-tooltip-container").firstChild;
  if (tooltiptext && tooltiptext.getAttribute("value") == param.originalURL) {
    tooltiptext.setAttribute("value", param.url);
  }
}

//
// tweet hover
//
function onMouseOver(event)
{
  var node = event.target;
  while (node && node.tagName != 'echofon-status') node = node.parentNode;
  if (!node) return;


  var favorite = document.getAnonymousElementByAttribute(node, "anonid", "favorite");
  if (favorite) {
    if (node.getAttribute("attr") != "messages") {
      favorite.style.display = "block";
    }
  }
  var reply = document.getAnonymousElementByAttribute(node, "anonid", "reply");
    if (reply) {
      reply.style.display = "block";
    }
}

function onMouseOut(event)
{
  var node = event.target;
  while (node && node.tagName != 'echofon-status') node = node.parentNode;
  if (!node) return;

  var favorite = document.getAnonymousElementByAttribute(node, "anonid", "favorite");
  if (favorite) {
    if (node.getAttribute("favorited") == "true") {
      favorite.style.display = "block";
    }
    else {
      favorite.style.display = "none";
    }
  }
  var reply = document.getAnonymousElementByAttribute(node, "anonid", "reply");
  if (reply) {
    reply.style.display = "none";
  }
}

//
// methods for menuitems
//

// user icon menu

function reply(parent, tweet, stats_url)
{
  var menu = menuPopup();
  if (menu.user) {
    var text = "@" + menu.user.screen_name + " ";
  }
  else {
    var text = "@" + tweet.user.screen_name + " ";
  }
  var panel = EchofonCommon.openComposeWindow(parent, text);
  if (tweet) {
    panel.inReplyTo = tweet.id;
    panel.inReplyToMessage = tweet.full_text;
    panel.statsURL = stats_url;
  }
}

function DM()
{
  var user = menuPopup().user;
  var text = "d " + user.screen_name + " ";
  var panel = EchofonCommon.openComposeWindow(null, text);
}

function muteUser()
{
  var user = menuPopup().user;
  mute(user.screen_name, 'user');
}

function block(type)
{
  var user = menuPopup().user;
  var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
  var ret = prompt.confirm(window, "Echofon", EchofonCommon.getFormattedString("Confirm" + type, [user.screen_name]));
    if (ret) {
      EchofonCommon.notify("blockUser", {user_id:user.id, type:type});
    }
}

// link menu

function copyURL()
{
  var elem = menuPopup().target;
  var text;
  if (elem.getAttribute("expanded_url")) {
    text = elem.getAttribute('expanded_url');
  }
  else {
    text = elem.getAttribute('href');
  }
  Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
}

function postWithLink()
{
  var elem = menuPopup().target;
  var text;
  if (elem.getAttribute("expanded_url")) {
    text = elem.getAttribute('expanded_url');
  }
  else {
    text = elem.getAttribute('href');
  }
  EchofonCommon.openComposeWindow(elem, text, true);
}

function muteTag(type)
{
  var elem = menuPopup().target;
  mute(elem.getAttribute("text"), type);
}

function replyToMention()
{
  var elem = menuPopup().target;
  var text = elem.getAttribute("screen_name");
  if (!text.match(/^@.*/)) {
    text = '@' + text;
  }
  EchofonCommon.openComposeWindow(elem, text + ' ');
}

function searchMention()
{
  var elem = menuPopup().target;
  var text = elem.getAttribute("screen_name");
  if (!text.match(/^@.*/)) {
    text = '@' + text;
  }
  EchofonCommon.notifyObservers("searchTweets", text);
}

function postWithTag()
{
  var elem = menuPopup().target;
  EchofonCommon.openComposeWindow(elem, elem.getAttribute('text'), true);
}

// tweet menu

function copyText()
{
  Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(menuPopup().target.getAttribute("text"));
}

function retweet()
{
  var elem = menuPopup().target;
  if (elem.getAttribute("is_own_retweet")) {
    EchofonCommon.notify("undoRetweet", {id:elem.tweet.retweeted_status_id});
  }
  else {
    var prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
    var ret = prompt.confirm(window, "Echofon", EchofonCommon.getFormattedString("ConfirmRetweet", [elem.getAttribute("text")]));
    if (ret) {
      EchofonCommon.notify("retweet", {id:elem.getAttribute("messageId")})
    }
  }
}

function retweetWithComment()
{
  var elem = menuPopup().target;
  var text = "RT: @" + elem.getAttribute("screen_name") + ": " + elem.getAttribute("text");
  EchofonCommon.openComposeWindow(elem, text, true);
}

function replyAll()
{
  var elem = menuPopup().target;
  var tweet = elem.getAttribute("text");
  var users = tweet.match(/@[A-Za-z0-9_]+/g);
  users.unshift("@" + elem.getAttribute("screen_name"));

  var hash = {};
  for (var i in users) {
    if ("@" + activeUserName().toLowerCase() != users[i].toLowerCase()) {
      hash[users[i]] = users[i];
    }
  }
  users = [];
  for (var key in hash) {
    users.push(key)
  }
  var text = users.join(" ") + " ";


  var parent = document.getAnonymousElementByAttribute(elem, "anonid", "usericon");
  var panel = EchofonCommon.openComposeWindow(parent, text);
  panel.inReplyTo = elem.getAttribute("messageId");
  panel.inReplyToMessage = elem.getAttribute("text");
}

function deleteTweet()
{
  var elem = menuPopup().target;
  var prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
  var ret = prompt.confirm(window, "Echofon", EchofonCommon.getFormattedString("ConfirmDeleteTweet", [elem.getAttribute("text")]));
  if (ret) {
    EchofonCommon.notify("deleteTweet", {id:elem.getAttribute("messageId")});
  }
}
