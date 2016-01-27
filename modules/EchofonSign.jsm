//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonSign"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;
const ECHOFON_UUID = "twitternotifier@naan.net";

Cu.import("resource://echofon/Models.jsm")

var sign_for_sync_server = null;
var oauth_signature = null;

function EchofonSign()
{
}

function libraryPath(libname)
{
  libpath = EchofonModel.libraryPath().QueryInterface(Components.interfaces.nsIFileURL).file;
  // For XULRunner
  if (!libpath.exists()) {
    libpath = prop.get("DefRt", Ci.nsIFile).parent;
    libpath.append("platform");
  }

  libpath.append(libname);

  return libpath.path;
}

function loadFunction()
{
  if (sign_for_sync_server) return;

  try {
    Cu.import("resource://gre/modules/ctypes.jsm")
  }
  catch (e) {
    Cu.reportError("Failed to load js-ctypes");
    return;
  }

  var runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
  try {
    var lib = null;
    switch (runtime.OS) {
      case 'Darwin':
        lib = ctypes.open(libraryPath("echofonsign.dylib"));
        break;

      case 'WINNT':
        try {
          lib = ctypes.open(libraryPath("echofonsign.dll"));
        }
        catch (e) {
          lib = ctypes.open(libraryPath("echofonsign_64.dll"));
        }
        break;
      case 'Linux':
        try {
          lib = ctypes.open(libraryPath("echofonsign.so"));
        }
        catch (e) {
          lib = ctypes.open(libraryPath("echofonsign_64.so"));
        }
        break;
    }

    if (lib == null) {
      return;
    }
    sign_for_sync_server = lib.declare("sign_for_sync_server",
                         ctypes.default_abi,
                         ctypes.int32_t,
                         ctypes.char.ptr,
                         ctypes.int32_t,
                         ctypes.uint32_t.ptr);

    oauth_signature = lib.declare("oauth_signature",
                         ctypes.default_abi,
                         ctypes.int32_t,
                         ctypes.char.ptr,
                         ctypes.int32_t,
                         ctypes.char.ptr,
                         ctypes.int32_t,
                         ctypes.uint32_t.ptr);
  }
  catch (e) {
    Cu.reportError(e.message);
    return;
  }

  if (sign_for_sync_server == null) {
    Cu.reportError("Couldn't find sign library");
  }
}

function signByLibrary(str)
{
  loadFunction();

  let arrayType = ctypes.ArrayType(ctypes.uint32_t);
  let myArray = new arrayType(5);

  var val = ctypes.char.array()(str);
  var err = sign_for_sync_server(val, val.length-1, myArray);
  var ret = "";
  for (var i = 0; i < 5; ++i) {
    var s = myArray[i].toString(16);
    while (s.length < 8) {
      s = "0" + s;
    }
    ret += s;
  }
  return ret;
}

var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */
var b64pad  = "="; /* base-64 pad character. "=" for strict RFC compliance   */

function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}
function OAuthSignatureByLibrary(base, secret)
{
  loadFunction();

  var u_base = ctypes.char.array()(base);
  var u_secret = ctypes.char.array()(secret);
  let arrayType = ctypes.ArrayType(ctypes.uint32_t);
  let myArray = new arrayType(5);

  var err = oauth_signature(u_base, u_base.length-1, u_secret, u_secret.length-1, myArray);

  var arr = [];
  for(var i = 0; i < 5; ++i) {
    arr[i] = myArray[i];
  }
  return binb2b64(arr);
}

EchofonSign.getSignatureForSyncServer = function(str)
{
  if (Cc['@naan.net/twitterfox-sign;1']) {
    var com = Cc['@naan.net/twitterfox-sign;1'].getService(Ci.nsITwitterFoxSign);
    var sig = com.sign(str);
    var toHexString = function(charCode) { return ("0" + charCode.toString(16)).slice(-2); };
    return sig.map((e) => toHexString(sig.charCodeAt(e))).join("");
  }
  else {
    return signByLibrary(str);
  }
}

EchofonSign.OAuthSignature = function(str, secret)
{
  if (Cc['@naan.net/twitterfox-sign;1']) {
    var com = Cc['@naan.net/twitterfox-sign;1'].getService(Ci.nsITwitterFoxSign);
    return com.OAuthSignature(str, secret);
  }
  else {
    return OAuthSignatureByLibrary(str, secret);
  }
}