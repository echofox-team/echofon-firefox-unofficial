//
// Copyright (c) 2010 Kazuho Okui / naan studio, Inc. ALL RIGHTS RESERVED.
//

const {classes:Cc, interfaces:Ci, utils:Cu} = Components;
Cu.import("resource://echofon/EchofonUtils.jsm");

var EXPORTED_SYMBOLS = ["SW"];

function SW(name)
{
  this.name = name;
  this.begin = new Date().getTime();
  this.prev  = this.begin;
}

SW.prototype.lap = function(msg)
{
  let now = new Date().getTime();
  if (!msg) msg = this.name;

  var total = now - this.begin;
  var lap = now - this.prev;
  this.prev = now;

  EchofonUtils.debug(msg + ":  lap " + lap + "ms / total " + total + "ms");
}
