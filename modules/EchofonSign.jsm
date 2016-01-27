//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

var EXPORTED_SYMBOLS = ["EchofonSign"];

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;

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
  var prefs = Cc['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitternotifier.");
  try {
    const customSecret = prefs.getCharPref("customSecret");
    if(!customSecret) throw 'No custom key';
    return b64_hmac_sha1(customSecret + "&" + secret, str);
  } catch(e) {
    if (Cc['@naan.net/twitterfox-sign;1']) {
      var com = Cc['@naan.net/twitterfox-sign;1'].getService(Ci.nsITwitterFoxSign);
      return com.OAuthSignature(str, secret);
    }
    else {
      return OAuthSignatureByLibrary(str, secret);
    }
  }
}

/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1 Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var hexcase = 0;

function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

function sha1_vm_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

function core_sha1(x, len)
{
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)), 
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);
  
}

function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}  

function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++) 
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i%32);
  return bin;
}

function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (24 - i%32)) & mask);
  return str;
}

function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}
