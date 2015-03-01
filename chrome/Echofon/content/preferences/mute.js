//
//
//

Components.utils.import("resource://echofon/EchofonSync.jsm");

var keys = ['user', 'app', 'hashtag'];

function onload()
{
  this.sync = EchofonSync.instance().getSyncData(this.user_id);

  if (!this.sync) this.sync = {};
  if (!this.sync.mute) this.sync.mute = {user:[], app:[], hashtag:[]};

  for (var i in keys) {
    var key = keys[i];
    var values = this.sync.mute[key];
    var list = EchofonCommon.$(key);
    for (var j in values) {
      list.appendItem(values[j], key);
    }
  }
}

function onselectItem(item)
{
  for (var i in keys) {
    EchofonCommon.$("remove-" + keys[i]).disabled = true;
  }
  var id = "remove-" + item.value;
  try {
    EchofonCommon.$(id).disabled = false;
  }
  catch (e) {}
}

function removeItem(type)
{
  var list = EchofonCommon.$(type);
  var item = list.selectedItem;
  EchofonSync.instance().unmute(this.user_id, item.label, item.value);
  EchofonCommon.$(item.value).removeChild(item);
}

function addItem(type)
{
  var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
  var check = {value: false};
  var input = {value: ""};

  var param = EchofonCommon.getString(type + "String");

  var result = prompts.prompt(null,
                              EchofonCommon.getString("AddNewMute"),
                              EchofonCommon.getFormattedString("AddMuteExplain", [param]),
                              input, null, check);

  if (result) {
    if (type == 'hashtag') {
      if (input.value[0] != '#') {
        input.value = '#' + input.value;
      }
    }
    if (EchofonSync.instance().mute(this.user_id, input.value, type)) {
      var list = EchofonCommon.$(type);
      list.appendItem(input.value, type);
    }
  }
}

