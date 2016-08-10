
var gAccountsPane = {
  init: function() {
    Components.utils.import("resource://echofon/Account.jsm");
    Components.utils.import("resource://echofon/Models.jsm");
    Components.utils.import("resource://echofon/EchofonSync.jsm");

    this.accounts = EchofonAccountManager.instance().allAccounts();

    var list = EchofonCommon.$("accounts");
    while (list.firstChild) list.removeChild(menu.firstChild);

    if (this.accounts.length == 0) {
      this.updateButtonState();
      return;
    }

    for (var i in this.accounts) {
      var account = this.accounts[i];
      var item = list.appendItem(account.screen_name, account.user_id);
    }

    this.updateButtonState();

    EchofonCommon.$("sync-account-button").setAttribute("label", EchofonCommon.getString("enableSync"));
  },

  onAddAccount: function() {
    this.oauthWindow = window.openDialog("chrome://echofon/content/OAuth.xul", "Echofon:OAuth",
                              "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=no,dependent=yes,width=800,height=660");
    this.oauthWindow.callback = gAccountsPane;
  },

  onFinishOAuth: function(user_id) {
    var account = EchofonAccountManager.instance().get(user_id);

    if (EchofonCommon.pref().getCharPref("activeUserIdStr") == '') {
      EchofonCommon.pref().setCharPref("activeUserIdStr", account.user_id);
    }

    var list = EchofonCommon.$("accounts");
    var item = list.appendItem(account.screen_name, account.user_id);
    list.selectItem(item);

    this.updateButtonState();
  },

  onSyncAccount: function() {
    var list = EchofonCommon.$("accounts");

    var user_id = list.selectedItem.value;
    var screen_name = list.selectedItem.label;

    if (EchofonSync.instance().isSynced(user_id)) {
      EchofonSync.instance().disableSync(user_id);
      this.enableSyncButton(true);
    }
    else {
      // enable sync
      EchofonSync.instance().registerUser(user_id, screen_name, this);
      EchofonCommon.$("sync-account-button").setAttribute("image", "chrome://echofon/content/images/sync-loading.gif");
    }
  },

  userDidRegister: function(flag) {
    if (flag) {
      this.enableSyncButton(false);
    }
    else {
      alert(EchofonCommon.getString("FailedToSetupSync"));
    }
    EchofonCommon.$("sync-account-button").removeAttribute("image");
  },

  onSelectAccount: function() {
    this.updateButtonState();
  },

  enableSyncButton: function(flag) {
      EchofonCommon.$("sync-account-button").setAttribute("label", EchofonCommon.getString((flag) ? "enableSync" : "disableSync"));
  },

  promptPasswordDialog: function(user, pass, msg) {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    while (1) {
      var result = prompt.promptUsernameAndPassword(window, "Echofon", msg, user, pass, "", {value:false});
      if (!result) return false;
      if (user.value && pass.value) return true;
    }
    return true;
  },

  onMuteSetting: function() {
    var win = window.openDialog("chrome://echofon/content/preferences/mute.xul", "Echofon:mute",
                                "chrome,dialog=yes,titlebar,toolbar,centerscreen,resizable=no,dependent=yes");
    win.user_id = EchofonCommon.$("accounts").selectedItem.value;
  },

  onRemoveAccount: function() {
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    var list = EchofonCommon.$("accounts");
    var screen_name = list.selectedItem.label;
    var msg = EchofonCommon.getFormattedString("RemoveAccountConfirm", [screen_name]);
    var result = prompt.confirm(window, "Echofon", msg);
    if (!result) return;

    var user_id = list.selectedItem.value;
    list.removeItemAt(list.selectedIndex);
    this.updateButtonState();

    // switch account or logout if user delete current
    if (user_id == EchofonCommon.pref().getCharPref("activeUserIdStr")) {
      if (list.firstChild) {
        EchofonCommon.notify("changeAccount", {user_id:list.firstChild.value});
      }
      else {
        EchofonCommon.notify("logout");
      }
    }
    EchofonCommon.notify("removeAccount", {user_id:user_id});
    EchofonCommon.notifyObservers("updateAccountIcon");
  },

  updateButtonState: function() {

    var list = EchofonCommon.$("accounts");
    var buttons = ["sync-account-button", "mute-setting-button", "remove-account-button"];
    var flag = !list.itemCount || list.selectedIndex < 0;

    for (var i in buttons) {
      EchofonCommon.$(buttons[i]).disabled = flag;
    }

    try {
      var user_id = list.selectedItem.value;
      if (EchofonSync.instance().isSynced(user_id)) {
        this.enableSyncButton(false);
      }
      else {
        this.enableSyncButton(true);
      }
    }
    catch (e) {}
  }
};
