# Echofon Unofficial

Maintained version of Echofon: full featured, super clean Twitter app for Firefox.

This is based on [JaHIY](https://github.com/JaHIY) [changes](https://gist.github.com/JaHIY/4483939) and a follow up to fix support for Firefox 36 and ongoing.

**You can [download the signed add-on here](/../../releases).**


[![Join the chat at https://gitter.im/AntoineTurmel/echofon-firefox-unofficial](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/AntoineTurmel/echofon-firefox-unofficial?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


## Developers ##

### Build ###

To build XPI package, you need few tools available from your PATH:
- *sed*
- *zip*

Run `./build.sh` to zip Echofon.jar and produce the new XPI in `build` directory.

*(Tested in Unix and MinGW environments)*

### Debug ###

Firefox [Add-on Debugger](https://developer.mozilla.org/en-US/Add-ons/Add-on_Debugger) is only available for *restartless and SDK-based add-ons*.
So, to debug **Echofon Unofficial**, please use *[Browser Toolbox](https://developer.mozilla.org/en-US/docs/Tools/Browser_Toolbox) and its Debugger tool*.
