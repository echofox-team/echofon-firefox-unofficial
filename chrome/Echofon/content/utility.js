//
// Common functions for echofon
//
// Copyright (c) 2009-2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

if (typeof EchofonCommon == 'undefined') {

Components.utils.import("resource://echofon/PhotoBackend.jsm");

const e = React.createElement;

function getString(key) {
  return document.getElementById("echofon-strings").getString(key).replace(/\\S/g, " ");
}

function formatText({ children, type }) {
  const text = getString(type);

  // for single value
  let arr = text.split(/(%S)/);
  if (arr.length > 1) {
    arr[1] = children;
    return arr;
  }

  // for multiple values
  return text.split(/%(\d)\$S/).map((chunk, i) => ((i % 2) && children[parseInt(chunk)-1]) || chunk);
}

const AnchorText = ({ children, link, text, type, className = 'echofon-hyperlink', additionalClasses, style, screen_name, created_at, label }) => {
  const attrs = {
    style,
    className: additionalClasses ? className + ' ' + additionalClasses : className,
    href: link,
    type,
    ref: (node) => {
      if (node) {
        node.setAttribute('text', text);
        node.setAttribute('tooltip', 'echofon-tooltip');
        if (screen_name) node.setAttribute('screen_name', screen_name);
        if (created_at) node.setAttribute('created_at', created_at);
        if (label) node.setAttribute('label', label);
      }
    },
  };

  return e('label', attrs, children);
};

const StatusTagLine = ({ msg, fontSize, appMode, user }) => {
  let infoChildren = [];

  var permalink = (msg.retweeted_status_id) ? msg.retweeted_status_id : msg.id;

  if (msg.metadata && msg.metadata.result_type === "popular") {
    infoChildren.push(e('description', { className: 'echofon-top-tweet' }, 'Top Tweet'));
  }

  const label = EchofonCommon.getLocalTimeForDate(msg.created_at, appMode !== 'window' && msg.type !== 'user-timeline');
  const time = e(AnchorText, {
    link: EchofonCommon.twitterURL(user.screen_name + "/statuses/" + permalink),
    text: label,
    type: 'link',
    className: 'echofon-status-timestamp',
    created_at: new Date(msg.created_at).getTime(),
    label,
  }, label);
  infoChildren.push(time);

  if (msg.source) {
    if (msg.source.match(/<a href\=\"([^\"]*)\"[^>]*>(.*)<\/a>/)) {
      const source = e(AnchorText, {
        link: RegExp.$1,
        text: RegExp.$2,
        type: 'app',
        className: 'echofon-source-link',
      }, RegExp.$2);
      const sources = formatText({type: 'via', children: source});

      infoChildren.push(e('box', {}, ' '), ...sources); // whitespace box hack, if better, plz tell us
    }
  }
  if (msg.place) {
    if (appMode === 'window') {
      const text = EchofonCommon.getFormattedString('from', [msg.place.full_name]);
      infoChildren.push(text);
    } else {
        infoChildren.push(e('box', {}, e('image', { className: 'echofon-place-icon' }), msg.place.full_name));
    }
  }
  if (msg.in_reply_to_status_id && msg.in_reply_to_screen_name) {
    const link = EchofonCommon.twitterURL(msg.in_reply_to_screen_name + '/statuses/' + msg.in_reply_to_status_id);
    if (appMode === 'window' || msg.type === 'user-timeline') {
      const text = EchofonCommon.getFormattedString('inReplyToInline', [msg.in_reply_to_screen_name]);
      infoChildren.push(
        e(AnchorText, {
          link,
          text,
          type: 'tweet-popup',
          className: 'echofon-source-link echofon-source-link-left-padding',
        }, text)
      );
    } else {
      const icon = e('image', {
        className: 'echofon-in-reply-to-icon',
      });
      infoChildren.push(
        e(AnchorText, {
          link,
          type: 'tweet-popup',
          className: 'echofon-source-link',
        }, icon, msg.in_reply_to_screen_name)
      );
    }
  }
  /*
  if (msg.metadata && msg.metadata.result_type === 'popular') {
    if (msg.metadata.recent_retweets) {
      infoChildren.push(e(
        'description',
        { className: 'echofon-top-tweet-retweets' },
        `, retweeted ${msg.metadata.recent_retweets} times`
      ));
    }
  }
  */

  return e('echofon-status-tagline', {
    style: {
      fontSize: (fontSize - 1) + 'px',
      display: 'block',
    },
  }, ...infoChildren);
};

var EchofonCommon = {

  FFVersion: 0,

  $: function(id) {
    return document.getElementById(id);
  },

  pref: function () {
    if (!this._pref) {
      this._pref = Components.classes['@mozilla.org/preferences-service;1']
       .getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitternotifier.");
    }
    return this._pref;
  },

  notify: function(command) {
    var p = {
      "command": command
    };

    if (arguments[1]) {
      for (var i in arguments[1]) {
        if (arguments[1].hasOwnProperty(i)) {
          p[i] = arguments[1][i];
        }
      }
    }
    var data = JSON.stringify(p);
    var obs = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

    obs.notifyObservers(null, "echofon-command", data);
  },

  notifyObservers: function(sts, obj, timeout) {
    var msg = {"state": sts, "data": obj};
    var data = JSON.stringify(msg);
    var obs = this.Cc["@mozilla.org/observer-service;1"].getService(this.Ci.nsIObserverService);
    obs.notifyObservers(null, "echofon-status", data);
  },

  isXULRunner: function() {
    if (!this.appInfo) {
      this.appInfo = this.Cc["@mozilla.org/xre/app-info;1"].getService(this.Ci.nsIXULAppInfo);
    }
    return this.appInfo.name == "Echofon";
  },

  geckoGetRv: function() {
    var rvValue = 0;
    var ua      = navigator.userAgent.toLowerCase();
    var rvStart = ua.indexOf('rv:');
    var rvEnd   = ua.indexOf(')', rvStart);
    var rv      = ua.substring(rvStart+3, rvEnd);
    var rvParts = rv.split('.');
    var exp     = 1;

    for (var i = 0; i < rvParts.length; i++) {
      var val = parseInt(rvParts[i]);
      rvValue += val / exp;
      exp *= 100;
    }
    return rvValue;
  },

  isFF4: function() {
    if (!this.FFVersion) {
      this.FFVersion = this.geckoGetRv();
    }
    return this.FFVersion >= 2.0;
  },

  twitterURL: function(path) {
    if (!path) path = "";
    return "https://twitter.com/" + path;
  },

  userViewURL: function(screen_name) {
    return "chrome://echofon/content/user-view.xul?screen_name=" + screen_name;
  },

  createMessageBalloon: function(uid, msg, highlight) {

    if (msg.type == "thread") {
      return this.createThreadCell(uid, msg);
    }
    else {
      return this.createTweetCell(uid, msg, highlight);
    }
  },

  createTweetCell: function(uid, tweet, highlighted) {
    if (document.getElementById("echofon-status-" + tweet.type + "-" + tweet.id)) return null;
    var elem = document.createElement("echofon-status");
    elem.id = "echofon-status-" + tweet.type + "-" + tweet.id;
    elem.setAttribute("messageId", tweet.id);
    elem.setAttribute("type", tweet.type);
    if (tweet.retweeted_status_id) {
      elem.createdAt   = new Date(tweet.retweeted_at).getTime();
    }
    else {
      elem.createdAt   = new Date(tweet.created_at).getTime();
    }
    elem.unread      = tweet.unread;
    elem.tweet       = tweet;
    elem.uid         = uid;
    elem.user        = tweet.user;
    elem.highlighted = highlighted;
    elem.appMode   = EchofonCommon.pref().getCharPref("applicationMode");

    try{
      elem.setAttribute("messageId", elem.tweet.id);
      var fontSize = EchofonCommon.fontSize();
      if (!elem.getAttribute("user-timeline")) {
        elem.setAttribute("mode", elem.appMode);
      }
      elem.style.fontSize = fontSize + "px";
      elem.style.fontFamily = EchofonCommon.pref().getCharPref("fontFace");


      var msg = elem.tweet;
      var user = elem.user;

      elem.setAttribute("profile_image_url", user.profile_image_url);

      elem.setAttribute("href", EchofonCommon.userViewURL(user.screen_name));

      elem.setAttribute("replyButtonTooltip", EchofonCommon.getFormattedString("ReplyTo", [elem.user.screen_name]));
      elem.setAttribute("screen_name", user.screen_name);
      if (user.id == elem.uid) {
        elem.setAttribute('is_own_tweet', true);
      }

      elem.setAttribute("name", user.name);

      elem.setAttribute("requestFavorite", false);
      elem.setAttribute("favorited", msg.favorited);
      elem.setAttribute("favoriteButtonTooltip", EchofonCommon.getString(msg.favorited ? "UnfavoriteTweet" : "FavoriteTweet"));
      elem.setAttribute("isFavorited", (msg.favorited) ? "block" : "none");

      var style = this.pref().getIntPref("displayStyle");
      var nameNode =  null;
      if (style == 0) {
        nameNode = document.createElement('description');
        nameNode.className = "echofon-status-body";
        var anchor = e(AnchorText, {
          link: this.userViewURL(user.screen_name),
          text: user.name,
          type: 'username',
          screen_name: user.screen_name,
          additionalClasses: 'echofon-status-user'
        }, user.name);

        var screenName = e(AnchorText, {
          link: this.userViewURL(user.screen_name),
          text: `@${user.screen_name}`,
          type: 'username',
          className: 'echofon-status-additional-screen-name',
          screen_name: user.screen_name,
          style: msg.type != 'user-timeline' ? {
            fontSize: (fontSize - 1) + 'px',
          } : undefined,
        }, `@${user.screen_name}`);

        // TMP: React can only render single elements, so we need to wrap in a box for now
        // As soon as we transform nameNode into a component, remove this <box>
        ReactDOM.render(e('box', {}, anchor, screenName), nameNode);
      }

      var textnode = EchofonCommon.buildRichTextNode(uid, msg, user, elem);
      textnode.className = "echofon-status-body";
      elem.setAttribute("text", msg.full_text);
      elem.setAttribute("protected", user.protected ? 1 : 0);
      if (msg.has_mention && msg.type == 'home') {
        elem.setAttribute("highlighted", true);
      }

      let infoContainer = document.createElement('box');
      ReactDOM.render(e(StatusTagLine, { msg, fontSize, appMode: elem.appMode, user }), infoContainer);

      if (nameNode) {
        elem.appendChild(nameNode);
      }

      elem.appendChild(textnode);
      elem.appendChild(infoContainer);

      if (msg.retweeted_status_id > 0) {
        var rt = document.createElement("echofon-status-retweet-status");
        rt.setAttribute("anonid", "retweet");
        rt.style.fontSize = (fontSize - 1) + "px";

        const rt_icon = e('image', {
          className: 'echofon-retweet-icon'
        });

        const nameLabel = msg.retweeter_user_id == uid ? EchofonCommon.getString("you") : msg.retweeter_screen_name;
        const linkToUser = e(AnchorText, {
          link: EchofonCommon.userViewURL(msg.retweeter_screen_name),
          text: nameLabel,
          screen_name: msg.retweeter_screen_name,
          type: 'username',
        }, nameLabel);

        const rtby = formatText({type: 'retweetedBy', children: linkToUser});

        ReactDOM.render(e('box', {}, rt_icon, ...rtby), rt);

        if (msg.retweeter_user_id == uid) {
          elem.setAttribute("is_own_retweet", true);
        }
        elem.appendChild(rt);
      }
    }catch (e) {
      dump(e.message+":"+e.fileName+":"+e.lineNumber+"\n");
    }

    return elem;
  },

  findStatusElement: function(tweet_id) {
    var ret = [];
    var types = ['home', 'mentions', 'lists', 'search', 'user-timeline'];
    for (var i in types) {
      if (types.hasOwnProperty(i)) {
        var e = document.getElementById("echofon-status-" + types[i] + "-" + tweet_id);
        if (e) ret.push(e);
      }
    }
    return ret;
  },

  createThreadCell: function(uid, thread) {
    var elem = document.createElement("echofon-dm-thread");
    elem.id = "thread-" + thread.id;
    elem.setAttribute("messageId", thread.id);
    elem.uid = uid;
    elem.thread = thread;
    elem.user = thread.user;
    elem.style.fontFamily = EchofonCommon.pref().getCharPref("fontFace");
    elem.appMode = EchofonCommon.pref().getCharPref("applicationMode");
    return elem;
  },

  createConversationCell: function(uid, msg) {

    var elem = document.createElement("echofon-conversation");
    elem.id = 'conversation-' + msg.id;
    elem.uid = uid;
    elem.message = msg;
    elem.user = msg.sender;
    msg.type = 'message';

    var textelem = document.createElement("description");
    textelem.className = "echofon-message-body echofon-conversation-body";

    if (msg.entities) {
      this.convertLinksWithEntities(uid, msg, textelem, elem);
    }
    else {
      this.convertLinksWithRegExp(uid, msg, textelem, elem);
    }
    elem.appendChild(textelem);

    return elem;
  },

  createEventCell: function(event) {

    var id;
    var type = event['event'];

    if (type == 'favorite') {
      id = event['target_object'].id_str; // tweet id
    }
    else {
      id = event['source'].id_str; // user id
    }

    id = 'echofon-event-' + type + '-' + id;

    if (this.$(id)) return null;

    var elem = document.createElement("echofonEvent");
    elem.className = "echofon-event-" + type;
    elem.style.fontFamily = EchofonCommon.pref().getCharPref("fontFace");
    elem.id = id;
    elem.createdAt = Date.now();
    return elem;
  },

  buildRichTextNode : function(uid, msg, user, parent_elem) {

    var elem = document.createElement("description");
    elem.className = "echofon-message-body";


      var style = this.pref().getIntPref("displayStyle");
      if (style != 0) {
        var displayName = (style == 1) ? user.name : user.screen_name;
        var anchor = this.createAnchorText(this.userViewURL(user.screen_name), displayName, "username");
        anchor.setAttribute("screen_name", user.screen_name);
        anchor.className += " echofon-status-user";
        elem.appendChild(anchor);
        elem.appendChild(document.createTextNode("  "));
      }

    if (msg.entities) {
      return this.convertLinksWithEntities(uid, msg, elem, parent_elem);
    }
    else {
      return this.convertLinksWithRegExp(uid, msg, elem, parent_elem);
    }
  },

  convertLinksWithRegExp: function(uid, msg, elem, parent_elem) {

    var escape = this.Cc["@mozilla.org/feed-unescapehtml;1"].getService(this.Ci.nsIScriptableUnescapeHTML);
    var text = escape.unescape((msg.full_text || msg.text).replace(/&amp;/g,"&"));

    var pat = /((https?\:\/\/|www\.)[^\s]+)([^\w\s\d]*)/g;
    var re = /[!.,;:)}\]]+$/;

    while (pat.exec(text) != null) {
      var left = RegExp.leftContext;
      var url = RegExp.$1;
      text = RegExp.rightContext;
      if (re.test(url)) {
        text = RegExp.lastMatch + text;
        url = url.replace(re, '');
      }

      this.convertFollowLink(elem, left);

      var urltext = url;
      if (url.length > 27) {
        urltext = url.substr(0, 27) + "...";
      }
      var anchor = this.createAnchorText(url, urltext, "link");
      this.checkPhotoURL(parent_elem, urltext);
      elem.appendChild(anchor);
      pat.lastIndex = 0;
    }

    if (text) {
      this.convertFollowLink(elem, text);
    }
    return elem;
  },

  convertLinksWithEntities: function(uid, msg, elem, parent_elem) {
    //
    // sort entities.
    //
    var entities = [];
    if (msg.entities) {
      for (var i in msg.entities) {
        if (msg.entities.hasOwnProperty(i)) {
          var key = i;
          for (var j in msg.entities[key]) {
            if (msg.entities[key].hasOwnProperty(j)) {
              var value = msg.entities[key][j];
              entities.push({'type':key, 'value':value})
            }
          }
        }
      }
    }
    function sort_entities(a,b) {
      var aa = a.value.indices[0];
      var bb = b.value.indices[0];
      return aa - bb;
    }

    entities.sort(sort_entities);

    //
    // building tweet with urls, mentions and hashtags.
    //
    function unescape(a) {
      var escape = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML);
      if (a[0] == ' ') {
        return ' ' + escape.unescape(a);
      }
      else {
        return escape.unescape(a);
      }
    }

    var index = 0;
    var text = msg.full_text || msg.text;
    for (var i in entities) {
      if (!entities.hasOwnProperty(i)) continue;
      var type = entities[i]['type'];
      var entity = entities[i]['value'];

      var start = entity['indices'][0];
      var end   = entity['indices'][1];
      if (start < index || end < start) continue;

      var left = text.substring(index, start);
      if (left) {
        elem.appendChild(document.createTextNode(unescape(left)));
      }
      var linked_text = unescape(text.substring(start, end));
      var a;
      switch (type) {
        case "urls":
          if (entity['display_url']) {
            linked_text = entity['display_url'];
          }
          var url = entity['url'];
          var expanded_url = entity['expanded_url'];
          a = this.createAnchorText(expanded_url ? expanded_url : url, linked_text, "link");
          a.setAttribute('url', url);
          a.setAttribute('expanded_url', expanded_url);
          this.checkPhotoURL(parent_elem, expanded_url ? expanded_url : url);
          break;

        case "user_mentions":
          a = this.createAnchorText(this.userViewURL(entity['screen_name']), linked_text, "username");
          a.setAttribute("screen_name", '@' + entity['screen_name']);
          if (entity['id'] ==uid) {
            elem.setAttribute("attr", "replies");
          }
          break;

        case "hashtags":
          a = this.createAnchorText('#' + entity['text'], linked_text, "hashtag");
          break;

        case "media":
          if (entity.type == "photo") {
            if (entity['display_url']) {
              linked_text = entity['display_url'];
            }
            var url = entity['url'];
            var expanded_url = entity['expanded_url'];
            a = this.createAnchorText(expanded_url ? expanded_url : url, linked_text, "link");
            a.setAttribute('url', url);
            a.setAttribute('expanded_url', expanded_url);
            parent_elem.setAttribute("status-photo", url);
            parent_elem.pb = EchofonPhotoBackend.initWithEntity(entity);
          }
          break;
        default:
          break;
      }
      elem.appendChild(a);
      index = entity['indices'][1];
    }
    if (text && index < text.length) {
      elem.appendChild(document.createTextNode(unescape(text.substring(index, text.length))));
    }
    return elem;
  },

  checkPhotoURL: function(elem, url) {
    var pb = new EchofonPhotoBackend(url);
    if (pb.isPhotoURL()) {
      elem.setAttribute("status-photo", url);
      elem.pb = pb;
    }
  },

  convertFollowLink: function(elem, text) {
    var pat = /([@＠]([A-Za-z0-9_]+(?:\/[\w-]+)?)|[#＃][A-Za-z0-9_]+)/;

    while(pat.exec(text) != null) {

      var leftContext = RegExp.leftContext;
      var matched = RegExp.$1;
      var username = RegExp.$2;
      var atUsername = RegExp.lastMatch;
      text = RegExp.rightContext;

      var followed = '';
      if (leftContext.length) {
        followed = leftContext[leftContext.length-1];
        var pat2 = /[A-Za-z0-9]/;
        if (pat2.test(followed)) {
          elem.appendChild(document.createTextNode(leftContext + matched));
          continue;
        }
      }

      elem.appendChild(document.createTextNode(leftContext));
      if (atUsername[0] == '@' || atUsername[0] == '＠') {
        if (followed == '_') {
          elem.appendChild(document.createTextNode(matched));
          continue;
        }
        var a = this.createAnchorText(this.userViewURL(username), atUsername, "username");
        a.setAttribute("screen_name", atUsername);
      }
      else {
        var a = this.createAnchorText(atUsername, atUsername, "hashtag");
      }
      elem.appendChild(a);
      pat.lastIndex = 0;
    }
    if (text) {
      elem.appendChild(document.createTextNode(text));
    }
  },

  createAnchorText: function(link, text, type, classname) {
      var anchor = document.createElement("label");
      anchor.className = classname ? classname : "echofon-hyperlink";
      anchor.setAttribute("href", link);
      anchor.setAttribute("type", type);
      anchor.setAttribute("text", text);

      anchor.setAttribute("tooltip", 'echofon-tooltip');

      anchor.appendChild(document.createTextNode(text));

      return anchor;
  },

  getLocalTimeForDate: function(time, shortFormat) {

    var system_date = new Date(time);
    var user_date = new Date();

    var delta_minutes = Math.floor((user_date - system_date) / (60 * 1000));
    if (Math.abs(delta_minutes) <= (8 * 24 * 60)) {
      return this.distanceOfTimeInWords(delta_minutes, shortFormat);
    }
    else {
      return system_date.toLocaleString();
    }
  },

  distanceOfTimeInWords: function(minutes, shortFormat) {
    if (minutes.isNaN) return "";

    var index;

    minutes = Math.abs(minutes);
    if (minutes < 1)         index = 'Now';
    else if (minutes < 50)   index = (minutes == 1 ? 'MinuteAgo' : 'MinutesAgo');
    else if (minutes < 90)   index = 'AboutOneHourAgo';
    else if (minutes < 1080) {
      minutes = Math.round(minutes / 60);
      index = 'HoursAgo';
    }
    else if (minutes < 1440) index = 'OneDayAgo';
    else if (minutes < 2880) index = 'AboutOneDayAgo';
    else {
      minutes = Math.round(minutes / 1440);
      index = 'DaysAgo';
    }
    if (shortFormat) index += "Short";
    return this.getFormattedString(index, [minutes]);
  },

  isWindowExist: function(name) {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("");
    while(enumerator.hasMoreElements()) {
      var win = enumerator.getNext();
      if (win.name == name) return win;
    }
    return null;
  },

  alertMessage: function(title, msg) {
    if (title == null) title = "Echofon";
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    prompt.alert(null, title, msg);
  },

  composePanel: function() {
    var parentWindow;
    if (window.name == "_echofon") {
      parentWindow = window;
    }
    else {
      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
      parentWindow = wm.getMostRecentWindow("navigator:browser");
    }

    return parentWindow.document.getElementById("echofon-compose-popup");
  },

  gotoUser: function() {
    var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
    var check = {value: false};
    var input = {value: ""};
    var result = prompts.prompt(null,
                                EchofonCommon.getString("goToUser"),
                                EchofonCommon.getString("enterScreenName"),
                                input, null, check);

    if (result) {
      var u = EchofonCommon.userViewURL(input.value);
      EchofonCommon.openURL(u, null, false, true);
    }
  },

  openProfile: function() {
    var acct = EchofonAccountManager.instance().get();
    var u = EchofonCommon.userViewURL(acct.screen_name);
    EchofonCommon.openURL(u, null, false, true);
  },

  reloadTimeline: function() {
    EchofonCommon.notify("refresh", {user_id:this.pref().getCharPref("activeUserIdStr")});
  },

  openComposeWindow: function(parentNode, text, cursorToBeginning) {

    var textbox = this.$('echofon-compose-bar');
    if (!textbox) {
      textbox = parent.document.getElementById('echofon-compose-bar');
    }

    if (!textbox && EchofonCommon.isXULRunner()) {
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
      var enumerator = wm.getZOrderDOMWindowEnumerator('Echofon:main', true);
      var mainWin = enumerator.getNext();
      textbox = mainWin.document.getElementById('echofon-compose-bar');
      mainWin.focus();
    }

    if (textbox) {
      if (textbox.textbox.value.length) {
        if (text.match(/^@/)) {
          textbox.textbox.value = text + " " + textbox.textbox.value;
        }
        else {
          textbox.textbox.value += " " + text;
        }
      }
      else {
        textbox.textbox.value = text;
      }
      try {
        $('echofon-textbox').focus();
      }
      catch (e) {}
      if (cursorToBeginning) {
        textbox.textbox.value = ' ' + textbox.textbox.value;
        textbox.textbox.setSelectionRange(0,0);
      }

      return textbox;
    }

    var panel = this.composePanel();
    if (panel.state == "open") return null;

    panel.user_id = EchofonCommon.pref().getCharPref("activeUserIdStr");

    if (cursorToBeginning) {
      panel.textbox.value = ' ' + text;
    }
    else if (text) {
      panel.textbox.value = text;
    }
    else {
      panel.textbox.value = '';
    }

    panel.cursorToBeginning = cursorToBeginning;
    panel.openPopup(parentNode, window);
    return panel;
  },

  closeComposeWindow: function() {
    try {
      this.composePanel().hidePopup();
    }
    catch (e) {}
  },

  isAccelKeyPressed: function(event) {
    if (event) {
      if (navigator.platform.match("Mac")) {
        if (event.metaKey) return true;
      }
      else {
        if (event.ctrlKey) return true;
      }
    }
    return false;
  },

  openURL: function(url, event, newTab, forceToSetActive) {

    var re = /(chrome:\/\/echofon\/content\/(?:user|conversation)-view\.xul)\?(.*)/;
    if (this.isXULRunner()) {
      if (re.test(url)) {
        var win = window.openDialog(RegExp.$1, "echofon:drawer", "chrome,resizable=yes,minimizable=yes,titlebar", RegExp.$2);
        win.focus();
      }
      else {
        var ioservice = this.Cc["@mozilla.org/network/io-service;1"].getService(this.Ci.nsIIOService);
        var uri = ioservice.newURI(url, null, null);
        var extps = this.Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(this.Ci.nsIExternalProtocolService);
        extps.loadURI(uri, null);
      }
      return;
    }

    var  pref = this.Cc['@mozilla.org/preferences-service;1'].getService(this.Ci.nsIPrefService).getBranch("browser.tabs.");
    var setActiveTab = !pref.getBoolPref("loadInBackground");

    if (forceToSetActive) setActiveTab = true;

    if (event) {
      if (event.button != 0) newTab = true;
      if (this.isAccelKeyPressed(event)) newTab = true;
      if (event.shiftKey) setActiveTab = !setActiveTab;
    }

    var targetWindow = null;
    var tabbrowser = null;
    if (window && window.gBrowser) {
      tabbrowser = window.gBrowser;
      targetWindow = window;
    }
    else {
      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
      var win = wm.getMostRecentWindow("navigator:browser");
      if (win && win.gBrowser) {
        tabbrowser = win.gBrowser;
        targetWindow = win;
      }
    }
    if (tabbrowser == null) {
      window.open(url);
      return;
    }

    var openInTwitter = false;
    if (EchofonCommon.pref().getBoolPref("openTwitterForUserPage")) {
      openInTwitter = true;
    }
    if (event && event.shiftKey) openInTwitter = !openInTwitter;

    var ure = /chrome:\/\/echofon\/content\/user-view.xul\?screen_name=([A-Za-z0-9_]+)/;
    if (ure.test(url) && openInTwitter) {
      url = "https://twitter.com/" + RegExp.$1;
    }

    var tabs = tabbrowser.tabContainer.childNodes;
    for (var i = 0; i < tabs.length; ++i) {
      var tab = tabs[i];
      try {
        var browser = tabbrowser.getBrowserForTab(tab);
        if (browser) {
          var doc = browser.contentDocument;
          var loc = doc.location.toString();
          if (loc == url) {
            tabbrowser.selectedTab = tab;
            return;
          }
          else if (!newTab && loc.match(re) && url.match(re)) {
            tabbrowser.selectedTab = tab;
            browser.loadURI(url);
            return
          }
        }
      }
      catch (e) {
        dump(e.message+"\n");
      }
    }

    if (this.pref().getBoolPref("openLinkInNewTab")) {
      newTab = true;
      if (this.isAccelKeyPressed(event)) setActiveTab = !setActiveTab;
    }

    if (newTab) {
      // There is no tab. open new tab...
      tabbrowser.loadOneTab(url, {inBackground:!setActiveTab});
    }
    else {
      tabbrowser.loadURI(url);
    }

    // Focus to browser window
    if (setActiveTab && EchofonCommon.pref().getCharPref("applicationMode") == "window") {
      targetWindow.focus();
    }
  },

  openPhotoView: function(pb) {
    var hud = window.open("chrome://echofon/content/HUD.xul", "", "chrome,resizable=yes,dependent=no,titlebar=no,centerscreen=yes");
    hud.pb = pb;
  },

  openPreferences: function() {
    var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
    var win = wm.getMostRecentWindow("Echofon:preferences");
    if (win) {
      win.focus();
    }
    else {
      window.openDialog("chrome://echofon/content/preferences/preferences.xul", "_blank",
                        "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=no,dependent=yes");
    }
  },

  openPurchase: function() {
    window.openDialog("chrome://echofon/content/purchase.xul",
                      "Echofon:Purchase",
                      "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=yes,dependent=yes,width=800,height=640");
  },

  getString: function(key) {
    return this.$("echofon-strings").getString(key).replace(/\\S/g, " ");
  },

  getFormattedString: function(key, params) {
    return this.$("echofon-strings").getFormattedString(key, params).replace(/\\S/g, " ");
  },

  formatTextNode: function(node, key, params) {
    var text = this.getString(key);

    // for single value
    var pat0 = /%S/;
    if (pat0.exec(text) != null) {
      var leftContext = RegExp.leftContext;
      var matched = RegExp.$1;
      text = RegExp.rightContext;

      if (leftContext.length) {
        node.appendChild(document.createTextNode(leftContext));
      }
      node.appendChild(params);
      if (text) {
        node.appendChild(document.createTextNode(text));
      }
      return node;
    }

    // for multiple values
    var pat = /%(\d)\$S/;
    while(pat.exec(text) != null) {
      var leftContext = RegExp.leftContext;
      var matched = RegExp.$1;
      text = RegExp.rightContext;

      if (leftContext.length) {
        node.appendChild(document.createTextNode(leftContext));
      }
      if (params[matched-1]) {
        node.appendChild(params[matched-1]);
      }
    }
    if (text) {
      node.appendChild(document.createTextNode(text));
    }
    return node;
  },

  // OAuth
  //
  startOAuth: function(screen_name, callback) {
    var win = window.openDialog("chrome://echofon/content/OAuth.xul?" + screen_name, "Echofon:OAuth",
                                "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=no,dependent=yes,width=800,height=660");
    win.callback = callback;
  },

  // Other utilities
  //
  initKeyConfig: function() {
    // workaround for mac
    if (navigator.platform.match("Mac") && this.pref().getBoolPref("splashScreen")) {
      this.pref().setCharPref("togglePopup", "E,,control meta");
      this.pref().setCharPref("insertURL", "L,,control meta");
    }

    // setup short cut keys
    var key = ["togglePopup", "insertURL"];

    for (var i = 0; i < key.length; ++i) {
      var pref = this.pref().getCharPref(key[i]);
      var params = pref.split(/,/);

      var elem = this.$("echofon-custom-key-" + key[i]);

      if (elem) {
        if (params[0])
          elem.setAttribute("key", params[0]);
        if (params[1])
          elem.setAttribute("keycode", params[1]);
        elem.setAttribute("modifiers", params[2]);
      }
    }
  },

  removeAllChild: function(obj) {
    while(obj.firstChild) obj.removeChild(obj.firstChild);
  },

  loadStyleSheet: function(url) {
    var sss = this.Cc["@mozilla.org/content/style-sheet-service;1"].getService(this.Ci.nsIStyleSheetService);
    var ios = this.Cc["@mozilla.org/network/io-service;1"].getService(this.Ci.nsIIOService);
    var uri = ios.newURI(url, null, null);
    if (!sss.sheetRegistered(uri, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
    else {
      sss.unregisterSheet(uri, sss.USER_SHEET);
    }
  },

  parseURLQuery: function(query) {
    var ret = {};
    var params = query.split('&');
    for (var i in params) {
      if (params.hasOwnProperty(i)) {
        var kv = params[i].split('=');
        ret[kv[0]] = kv[1];
      }
    }
    return ret;
  },

  fontSize: function() {
    return EchofonCommon.pref().getIntPref("fontSize");
  },

  Cc: this.Components.classes,
  Ci: this.Components.interfaces

};
}

function echofonObserver()
{
  Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).addObserver(this, "echofon-status", false);
}

echofonObserver.prototype.observe = function(subject, topic, data)
{
  if (topic != "echofon-status") return;

  var msg = JSON.parse(data);
  if (window.hasOwnProperty(msg.state)) {
    try {
      window[msg.state](msg.data);
    }
    catch (e) {
      Components.utils.reportError(e + " on " + msg.state + "(" + e.fileName + ":" + e.lineNumber + ")");
    }
  }
  if (this[msg.state]) {
    this[msg.state](msg.data);
  }
};

echofonObserver.prototype.failedToSendMessage = function(context)
{
  var panel = EchofonCommon.composePanel();
  if (panel && panel.timestamp == context.timestamp) {
    EchofonCommon.openComposeWindow(null, context.status);
    if (context.inReplyTo) {
      panel.inReplyTo = context.inReplyTo;
    }
    panel.error = context.error;
  }
};

echofonObserver.prototype.updateFavorite = function(tweet)
{
  var elems = EchofonCommon.findStatusElement(tweet.id);
  for (var i = 0; i < elems.length; ++i) {
    elems[i].setFavorited(tweet.state);
  }
};

echofonObserver.prototype.statusDidGet = function(resp)
{
  var e = document.getElementById('echofon-tweet-popup');
  if (e) {
    e.tweet = resp;
  }
};

echofonObserver.prototype.didGetPlaces = function(places)
{
  try {
    this.composePanel().places = places;
  }
  catch (e) {}
};

echofonObserver.prototype.remove = function()
{
  Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).removeObserver(this, "echofon-status");
};
