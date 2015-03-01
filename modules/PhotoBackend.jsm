var EXPORTED_SYMBOLS = ["EchofonPhotoBackend"];

function EchofonPhotoBackend(url)
{
  this._url = url;
  this.detectService();
}

const services = ["TwitPic", "Plixi", "yFrog", "Instagram", "Flickr", "picplz", "MyPict.me", "YouTube", "TwitVid", "Twitter"];

const PHOTO_LOAD_DELAY       = 300; // ms
const INSTAGRAM_OEM_ENDPOINT = "http://api.instagram.com/oembed/";
const FLICKR_OEM_ENDPOINT    = "http://www.flickr.com/services/oembed/";
const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

Cu.import("resource://echofon/EchofonDatabase.jsm");
Cu.import("resource://echofon/EchofonHttpRequest.jsm");

EchofonPhotoBackend.MEDIA_TYPE_VIDEO = "video";
EchofonPhotoBackend.MEDIA_TYPE_PHOTO = "photo";

EchofonPhotoBackend.defaultPath = null;

EchofonPhotoBackend.initWithEntity = function(entity)
{
  var pb = new EchofonPhotoBackend(entity['url']);
  pb._entity = entity;
  pb._service = "Twitter";
  pb.media = entity['type'];
  return pb;
}

EchofonPhotoBackend.prototype = {
  _url: null,
  _service: null,

  isPhotoURL: function() {
    return this._service;
  },

  detectService: function() {
    var ret = this._url.match('https?://'+
                              '((twitpic\.com/[A-Za-z0-9]+)|'+
                              '((?:plixi\.com/p/\\d+|lockerz\.com/s/\\d+))|'+
                              '(yfrog\.com/\\w+)|'+
                              '(instagr\.am/p/[-_A-Za-z0-9]+/)|'+
                              '(flic\.kr/p/[-_A-Za-z0-9]|(?:www\.)?flickr\.com/photos/[^/]+/\\d+/.*)|'+
                              '(picplz\.com/(?:[-A-Za-z0-9_]+|user/[-A-Za-z0-9_\.]/pic/[-A-Za-z0-9_]+/))|' +
                              '(mypict\.me/\\w+)|' +
                              '((?:www\.)?youtube\.com/\\S+|youtu\.be/\\S+)|'+
                              '((?:www\.)?twitvid\.com/\\w+)'+
                              ')');
    if (ret) {
      for (var i = 2; i <= 8; ++i) {
        if (ret[i]) {
          this._service = services[i-2];
        }
      }
    }
    if (this._service == "YouTube" || this._service == "TwitVid") {
      this.media = EchofonPhotoBackend.MEDIA_TYPE_VIDEO;
    }
    else {
      this.media = EchofonPhotoBackend.MEDIA_TYPE_PHOTO;
    }
    return this._service;
  },

  thumbnailURL: function(target_elem) {
    var url = this._url;

    switch (this._service) {
    case "TwitPic":
      return url.replace(/http:\/\/twitpic\.com\/(\w+)/, 'http://twitpic.com/show/mini/$1');
    case "Plixi":
      return "http://api.plixi.com/api/tpapi.svc/json/imagefromurl?size=thumbnail&url=" + url
        + "&TPAPIKEY=50483493-2f21-48e0-b3fb-bc06b631b6dc";
    case "yFrog":
      return url + ":small";
    case "MyPict.me":
      return url.replace(/http:\/\/mypict\.me\/(\w+)/, 'http://mypict.me/getthumb.php?size=100&id=$1');
    case "YouTube":
      var vid = null;
      if (url.match("youtu.be/(.*)")) {
        vid = RegExp.$1;
      }
      else {
        var URI = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(url, null, null);
        try {
          var aURL = URI.QueryInterface(Ci.nsIURL);
        }
        catch(e) {
          return "";
        }
        var queries = aURL.query.split('&');
        for (var i in queries) {
          var q = queries[i].split('=');
          if (q[0] == 'v') {
            vid = q[1];
            break;
          }
        }
      }
      if (vid) {
        return "http://img.youtube.com/vi/" + vid + "/default.jpg";
      }

    case "TwitVid":
      return url + ":thumb";

    case "Instagram":
      var ret = ImageURLCache.instance().getCachedURL(url+"200");
      if (ret) return ret;

      var oc = new OembedClient(INSTAGRAM_OEM_ENDPOINT, target_elem);
      return oc.getImageUrlForPageUrl(url, 200, target_elem);

    case "Flickr":
      var ret = ImageURLCache.instance().getCachedURL(url+"75");
      if (ret) return ret;

      if (url.match('flickr.com')) {
        var oc = new OembedClient(FLICKR_OEM_ENDPOINT, target_elem);
        return oc.getImageUrlForPageUrl(url, 75, target_elem);
      }
      else {
        return url.replace(/http:\/\/flic.kr\/p\/(\w+)/, "http://flic.kr/p/img/$1.jpg");
      }
      break;

    case "picplz":
      var ret = ImageURLCache.instance().getCachedURL(url+"100sh");
      if (ret) return ret;
      var pc = new PicplzClient(target_elem);
      return pc.getImageUrlForPageUrl(url, "100sh");

    case "Twitter":
      return this._entity['media_url'] + ":thumb";
    }
    return "";
  },

  photoURL: function(target_elem) {
    var url = this._url;

    switch (this._service) {
    case "TwitPic":
      return url.replace(/http:\/\/twitpic\.com\/(\w+)/, 'http://twitpic.com/show/large/$1');
    case "Plixi":
      return "http://api.plixi.com/api/tpapi.svc/json/imagefromurl?size=medium&url=" + url
        + "&TPAPIKEY=50483493-2f21-48e0-b3fb-bc06b631b6dc";
    case "yFrog":
      return url + ":iphone";
    case "MyPict.me":
      return url.replace(/http:\/\/mypict\.me\/(\w+)/, 'http://mypict.me/getthumb.php?size=640&id=$1');
    case "YouTube":
      return "";
    case "TwitVid":
      return "";

    case "Instagram":
      var ret = ImageURLCache.instance().getCachedURL(url+"600");
      if (ret) return ret;

      var oc = new OembedClient(INSTAGRAM_OEM_ENDPOINT, target_elem);
      return oc.getImageUrlForPageUrl(url, 612, target_elem);

    case "Flickr":
      var ret = ImageURLCache.instance().getCachedURL(url+"500");
      if (ret) return ret;

      if (url.match('flickr.com')) {
        var oc = new OembedClient(FLICKR_OEM_ENDPOINT, target_elem);
        return oc.getImageUrlForPageUrl(url, 500, target_elem);
      }
      else {
        return url.replace(/http:\/\/flic.kr\/p\/(\w+)/, "http://flic.kr/p/img/$1_m.jpg");
      }
    case "picplz":
      var ret = ImageURLCache.instance().getCachedURL(url+"640r");
      if (ret) return ret;

      var pc = new PicplzClient(target_elem);
      return pc.getImageUrlForPageUrl(url, "640r");

    case "Twitter":
      return this._entity['media_url'];
    }
    return "";
  }
};

var gEchofonImageURLCache = null;

function ImageURLCache()
{
  this.image_db = new EchofonDatabase();
  this.image_db.openImageCache(EchofonPhotoBackend.defaultPath);
}

ImageURLCache.instance = function()
{
  if (gEchofonImageURLCache == null) {
    gEchofonImageURLCache = new ImageURLCache();
  }
  return gEchofonImageURLCache;
}

ImageURLCache.prototype = {
  getCachedURL: function(url) {
    try{
      var stmt = this.image_db.prepare("SELECT url FROM images WHERE key = ?1");
      stmt.bindStringParameter(0, url);
      var ret = null;
      if (stmt.executeStep()) {
        ret = stmt.getString(0);
      }
      stmt.finalize();
    }catch (e) {}
    return ret;
  },

  storeURL: function(key, url) {
    try {
      var stmt = this.image_db.prepare("INSERT INTO images VALUES(?, ?)");
      stmt.bindStringParameter(0, key);
      stmt.bindStringParameter(1, url);
      stmt.executeAsync();
    }
    catch (e) {}
  }
}

function OembedClient(api_end_point, target_elem)
{
  this.endpoint = api_end_point;
  this.target = target_elem;
}

OembedClient.prototype = {
  getImageUrlForPageUrl: function(url, resolution) {

    this.key = url + resolution;

    var params = {url:url,
                  format:"json",
                  maxwidth:resolution,
                  maxheight:resolution};
    var paramArr = [];
    for (var key in params) {
      paramArr.push(key + "=" + params[key]);
    }
    var requestURL = this.endpoint + "?" + paramArr.join('&');

    var req = new EchofonHttpRequest();
    this.req = req;
    req.setURL(requestURL);
    var target = this;
    req.onload    = function() {target.onLoadOembed(req)};
    req.onerror   = function() {target.onErrorOembed()};
    gOembededOperation.add(this);

    return "";
  },

  start: function() {
    this.req.asyncOpen();
  },

  onLoadOembed: function(req) {
    try {
      var data = JSON.parse(req.responseText);
      ImageURLCache.instance().storeURL(this.key, data.url);
      if (this.target.loadImage) this.target.loadImage(data.url);
    }
    catch (e) {
      Components.utils.reportError(e.message);
      Components.utils.reportError(req.responseText);
    }
    this.operation.dequeue();
  },

  onErrorOembed: function() {
    this.operation.dequeue();
  }
};

function OembedOperation()
{
  this.queue = new Array();
}

OembedOperation.prototype = {
  add: function(client) {
    client.operation = this;
    this.queue.push(client);
    if (this.queue.length == 1) {
      client.start();
    }
  },

  dequeue: function() {
    this.queue.shift();
    if (this.queue.length > 0) {
      var obj = this;

      this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this.timer.initWithCallback({
        notify: function() {
          obj.start();
        }
      },
      PHOTO_LOAD_DELAY,
      Ci.nsITimer.TYPE_ONE_SHOT);
    }
  },

  start: function() {
    var client = this.queue[0];
    client.start();
  }
};

gOembededOperation = new OembedOperation();

function PicplzClient(target_elem)
{
  this.target = target_elem;
}

PicplzClient.prototype = {
  getImageUrlForPageUrl: function(url, format) {

    this.url = url;
    this.format = format;

    var params = {};
    var pat = /picplz\.com\/user\//;
    if (pat.test(url)) {
      pat = new RegExp('picplz\.com/user/[-A-Za-z0-9_\.]+/pic/([-A-Za-z0-9_]+)/');
      arr = pat.exec(url);
      params['longurl_ids'] = arr[1];
    }
    else {
      pat = /picplz\.com\/([-A-Za-z0-9_]+)/;
      var arr = pat.exec(url);
      params['shorturl_ids'] = arr[1];
    }

    var paramArr = [];
    for (var key in params) {
      paramArr.push(key + "=" + params[key]);
    }
    var requestURL = 'http://api.picplz.com/api/v2/pic.json' + "?" + paramArr.join('&');

    var req = new EchofonHttpRequest();
    this.req = req;
    req.setURL(requestURL);
    var target = this;
    req.onload    = function() {target.onLoadOembed(req)};
    req.onerror   = function() {target.onErrorOembed()};
    gOembededOperation.add(this);

    return "";
  },

  start: function() {
    this.req.asyncOpen();
  },

  onLoadOembed: function(req) {
    try {
      var data = JSON.parse(req.responseText);
      var picfiles = data.value.pics[0].pic_files;
      ImageURLCache.instance().storeURL(this.url + "640r", picfiles['640r'].img_url);
      ImageURLCache.instance().storeURL(this.url + "100sh", picfiles['100sh'].img_url);
      if (this.target.loadImage) this.target.loadImage(picfiles[this.format].img_url);
    }
    catch (e) {
      Components.utils.reportError(e.message);
      Components.utils.reportError(req.responseText);
    }
    this.operation.dequeue();
  },

  onErrorOembed: function() {
    this.operation.dequeue();
  }
};
