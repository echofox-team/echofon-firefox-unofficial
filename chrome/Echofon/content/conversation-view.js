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
//Components.utils.import("resource://echofon/EchofonGA.jsm");

const {classes:Cc, interfaces:Ci} = Components;
const container = $('echofon-tweets');
var account = null;
var gMessages = null;
var gTargetUser = null;

//
// Initializer
//
function onload()
{
  this._observer = new echofonObserver();

  var URI = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(window.location, null, null);
  var aURL = URI.QueryInterface(Ci.nsIURL);

  var uids = {};
  if (aURL.query) {
    var uids = EchofonCommon.parseURLQuery(aURL.query);
  }
  else {
    var uids = EchofonCommon.parseURLQuery(window.arguments[0]);
  }

  account = EchofonAccountManager.instance().get(uids.source);
  gTargetUser = EchofonModel.User.findById(uids.target, account.user_id);

  window.document.title = EchofonCommon.getFormattedString("conversationWith", [gTargetUser.screen_name]);

  gMessages = EchofonModel.DirectMessage.getConversationWith(account.user_id, gTargetUser.id);

  for (var i in gMessages) {
    var msg = gMessages[i];
    var elem = EchofonCommon.createConversationCell(gTargetUser.id, msg);
    if (msg.sender.id != account.user_id) {
      elem.setAttribute("avatarRight", "true");
    }
    container.appendChild(elem);
  }

  var lm = document.createElement('echofon-load-more');
  lm.id = 'echofon-load-more';
  lm.setAttribute("conversation", "true");
  container.insertBefore(lm, container.firstChild);

  // Add textbox, then scroll to bottom
  if (gMessages.length) {
    var textbox = document.createElement("echofon-conversation-compose");
    textbox.id = "echofon-conversation-compose";
    textbox.user = EchofonModel.User.findById(account.user_id, account.user_id);
    textbox.recipient = gTargetUser;
    msg.type = 'message';

    container.appendChild(textbox);
    getScrollBoxObject().ensureElementIsVisible(textbox);
  }
  //EchofonGA.instance().trackPage("/conversation");
}

function onunload()
{
  this._observer.remove();
}

function deleteMessage(menu)
{
  EchofonCommon.notify("deleteMessage", {id:menu.messageId});
}

function messageDidDelete(msg)
{
  for (var i = 0; i < container.childNodes.length; ++i) {
    var e = container.childNodes[i];
    if (e.message && e.message.id == msg.id) {
      container.removeChild(e);
      break;
    }
  }
}

function getScrollBoxObject()
{
  return container.parentNode.boxObject.QueryInterface(Components.interfaces.nsIScrollBoxObject);
}

function onScrollTweetBox(event)
{
  var box = getScrollBoxObject();
  var y = {};
  var height = {};
  box.getPosition({}, y);
  box.getScrolledSize({}, height);
  if (y.value <= 0) {
    var lm = $('echofon-load-more');
    if (lm.noMoreTweet) return;
    if (!lm.spinner) {
      lm.spinner = true;
      Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).
        initWithCallback({notify: function() {loadMore()}}, 300, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    }
  }
}

function loadMore()
{
  var lm = $('echofon-load-more');
  lm.spinner = false;
  var messages = EchofonModel.DirectMessage.getConversationWith(account.user_id, gTargetUser.id, 20, gMessages.length)
  if (messages.length == 0) {
    lm.noMoreTweet = true;
    return;
  }
  var height = 0;
  messages = messages.reverse();
  for (var i in messages) {
    var msg = messages[i];
    var elem = EchofonCommon.createConversationCell(gTargetUser.id, msg);
    if (msg.sender.id != account.user_id) {
      elem.setAttribute("avatarRight", "true");
    }
    container.insertBefore(elem, lm.nextSibling);
    gMessages.splice(0, 0, msg);
    height += parseInt(window.getComputedStyle(elem, null).height);
  }
  var box = getScrollBoxObject();
  box.scrollBy(0, height);
}

function insertTweet(status)
{
  var elem = EchofonCommon.createConversationCell(this, status, true);
  elem.setAttribute('user-timeline', true);
  if (container.firstChild) {
    container.insertBefore(elem, container.firstChild);
  }
  else {
    container.appendChild(elem);
  }
}

function receivedNewTweets(msgs)
{
  for (var i in msgs.tweets) {
    var msg = msgs.tweets[i];
    if (msg.type == 'messages') {
      if (msg.isSent) {
        if (msg.recipient.id == gTargetUser.id) {
          tweetDidSend(msg);
        }
      }
      else {
        if (msg.sender.id == gTargetUser.id) {
          tweetDidSend(msg);
        }
      }
    }
  }
}

function tweetDidSend(tweet)
{
  if (tweet.type != 'messages') return;
  var elem = EchofonCommon.createConversationCell(this, tweet, true);
  elem.setAttribute('user-timeline', true);
  if (tweet.sender.id != account.user_id) {
    elem.setAttribute("avatarRight", "true");
  }
  var textbox = $('echofon-conversation-compose');
  container.insertBefore(elem, textbox);
  getScrollBoxObject().scrollToElement(textbox);

}

function failedToSendMessage(context)
{
  var elem = $('echofon-conversation-compose');
  if (elem && elem.timestamp == context.timestamp) {
    elem.textbox.textbox.value = context.status;
    elem.textbox.error = context.error;
  }
}

function $(name) {return this.document.getElementById(name);}
