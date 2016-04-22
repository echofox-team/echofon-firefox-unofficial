const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

Cu.import("resource://echofon/Models.jsm");
Cu.import("resource://echofon/Account.jsm");
Cu.import("resource://echofon/TwitterClient.jsm");
Cu.import("resource://echofon/EchofonHttpRequest.jsm");

function onload() {
  if (!EchofonCommon.isFF4()) {
    $('signin').setAttribute("FF3", true);
  }

  if (EchofonCommon.isXULRunner()) {
    $('form').setAttribute('noeula', true);
  }
  if (EchofonCommon.pref().getCharPref("activeUserId") != '') {
    $('email-subscribe').style.display = 'block';
    $('authorize-form').style.display = 'none';
    $('email').focus();
    $('eula').style.display = 'none';
  }
  else {
    if (EchofonCommon.isXULRunner()) {
      $('eula').style.display = 'none';
      $('form').setAttribute('noeula', true);
    }
    else {
      $('signin').style.display = 'none';
      $('agree_and_auth').style.display = 'block';
    }
  }
}

function $(id) {
  return document.getElementById(id);
}

function authorize()
{
  Components.utils.import("resource://echofon/TwitterClient.jsm");
  var req = new TwitterClient({}, window);
  req.requestToken();
}

function onGetRequestToken(req)
{
  var statusCode = Number(req.status);

  if (statusCode == 200) {
    this.oauthWindow = window.openDialog("chrome://echofon/content/OAuth.xul", "Echofon:OAuth",
                              "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=no,dependent=yes,width=800,height=660");
    this.oauthWindow.callback = window;
  }
  else {
    alert(EchofonCommon.getString("FailedToGetOAuthToken"));
  }
}

function onErrorRequestToken(req)
{
    alert(EchofonCommon.getString("FailedToGetOAuthToken"));
}

function onFinishOAuth(user_id)
{
  if (EchofonCommon.pref().getCharPref("activeUserId") == '') {
    EchofonCommon.pref().setCharPref("activeUserId", user_id);
  }

  EchofonCommon.pref().setBoolPref("login", true);
  EchofonCommon.notify("initSession");
  if (EchofonCommon.isXULRunner()) {
      EchofonCommon.notifyObservers("loginCompleted");
  }
  else {
    EchofonCommon.notifyObservers("openWindow");

    $('email-subscribe').style.display = 'block';
    $('authorize-form').style.display = 'none';
    $('eula').style.display = 'none';
    $('email').focus();
  }
}

function submitEmail()
{
  var email = $('email').value;
  if (email.length == 0 || !email.match(/\w+@\w+\.\w/)) return;

  $('progress-bar').style.display = 'block';
  $('email_field').style.display = 'none';
  $('subscribe_button').style.display = 'none';

  var user_id = EchofonCommon.pref().getCharPref("activeUserId");

  var app = 'Echofon Firefox';
  if (EchofonCommon.isXULRunner()) {
    app = 'Echofon Windows';
  }
  var runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
  var os = '';
  switch (runtime.OS) {
    case 'Darwin':
      os = 'Mac';
      break;
    case 'WINNT':
      os = 'Windows';
      break;
    case 'Linux':
      os = 'Linux';
      break;
  }

  var url = 'https://sapi.postup.com/users/v1/' + user_id;
  var params = {'email':email, 'app':app, 'os':os};

  var arr = [];
  for (var i in params) {
    arr.push(i + '=' + encodeURIComponent(params[i]));
  }

  var r = new EchofonHttpRequest();
  r.setURL(url);
  r.setPostData(arr.join('&'));
  r.onload    = function(p) {emailDidRegister(r);}
  r.onerror   = function(p) {didFailToRegisterEmail(r);}
  r.asyncOpen();
}

function emailDidRegister(r)
{
  if (parseInt(r.status) != 200) {
    didFailToRegisterEmail(r);
    return;
  }
  $('progress-bar').style.display = 'none';
  $('explain').style.display = 'none';
  $('thank-you').style.display = 'block';

  setTimeout(function(){goToEchofonOrClose()}, 3000);
}

function didFailToRegisterEmail(r)
{
  alert(r.status + ': Failed to register email address: ' + r.responseText);
  $('progress-bar').style.display = 'none';
  $('email_field').style.display = 'block';
  $('subscribe_button').style.display = 'block';
}

function goToEchofonOrClose()
{
  if (EchofonCommon.isXULRunner()) {
    window.close();
  }
  else {
    window.location.assign("http://www.echofon.com/");
  }
}
