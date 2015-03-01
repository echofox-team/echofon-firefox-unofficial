var imageObj;
var url;

Components.utils.import("resource://echofon/PhotoBackend.jsm");

function onload() {
  if (typeof(window.pb) == "string") {
    url = window.pb;
    if (url.match(/(jpg|jpeg|png|gif)$/)) {
      loadImage(url);
    }
  }
  else {
    url = window.pb._url;
    loadImage(window.pb.photoURL(self));
  }
}

function onclick(event) {
  if (event.clientX < 20 && event.clientY < 20) {
    close();
  }
  else {
    EchofonCommon.openURL(url, null, true);
    close();
  }
}

function imageLoaded() {
  var elem = document.getElementById('echofon-hud-image');
  elem.src = imageObj.src;
  elem.hidden = false;
  elem.src.width  = imageObj.width + "px";
  elem.src.height = imageObj.height + "px";

  document.getElementById('echofon-loading-photo').hidden = true;

  var dx = window.outerWidth - imageObj.width;
  var dy = window.outerHeight - imageObj.height;
  window.moveBy(dx/2, dy/2);
  window.resizeTo(imageObj.width+2, imageObj.height + 20);
}

function failedToLoadImage() {
  document.getElementById('echofon-loading-photo').hidden = true;
  document.getElementById('echofon-hud-error').hidden = false;
}

function loadImage(aURL) {
  imageObj = new Image();
  imageObj.onload = function() {imageLoaded()};
  imageObj.onerror = function() {failedToLoadImage()};
  imageObj.src = aURL;
}
