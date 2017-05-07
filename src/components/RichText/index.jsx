import React from 'react';
import { substring, length } from 'stringz';

import AnchorText from '../AnchorText';

import * as DisplayStyles from '../../constants/display-style';

const convertFollowLink = (text) => {
  var pat = /([@＠]([A-Za-z0-9_]+(?:\/[\w-]+)?)|[#＃][A-Za-z0-9_]+)/;

  const elements = [];
  while(pat.exec(text) != null) {

    var leftContext = RegExp.leftContext;
    var matched = RegExp.$1;
    var username = RegExp.$2;
    var atUsername = RegExp.lastMatch;
    text = RegExp.rightContext;

    var followed = '';
    if (length(leftContext)) {
      followed = leftContext[length(leftContext)-1];
      var pat2 = /[A-Za-z0-9]/;
      if (pat2.test(followed)) {
        elements.push(leftContext + matched)
        continue;
      }
    }

    elements.push(leftContext);
    if (atUsername[0] == '@' || atUsername[0] == '＠') {
      if (followed == '_') {
        elements.push(matched);
        continue;
      }
      elements.push(
        <AnchorText
          link={EchofonCommon.userViewURL(username)}
          text={atUsername}
          type="username"
          screen_name={atUsername}
        >
          {atUsername}
        </AnchorText>
      )
    }
    else {
      elements.push(
        <AnchorText link={atUsername} text={atUsername} type="hashtag">
          {atUsername}
        </AnchorText>
      )
    }
    pat.lastIndex = 0;
  }
  if (text) {
    elements.push(text);
  }

  return elements;
};

const convertLinksWithRegExp = (text) => {
  const e = document.createElement('div');
  e.innerHTML = text;
  var text = e.textContent;

  var pat = /((https?\:\/\/|www\.)[^\s]+)([^\w\s\d]*)/g;
  var re = /[!.,;:)}\]]+$/;

  const elements = [];
  while (pat.exec(text) != null) {
    var left = RegExp.leftContext;
    var url = RegExp.$1;
    text = RegExp.rightContext;
    if (re.test(url)) {
      text = RegExp.lastMatch + text;
      url = url.replace(re, '');
    }

    elements.push(...convertFollowLink(left));

    var urltext = url;
    if (url.length > 27) {
      urltext = url.substr(0, 27) + "...";
    }
    elements.push(
      <AnchorText link={url} text={urltext} type="link">
        {urltext}
      </AnchorText>
    );
    pat.lastIndex = 0;
  }

  if (text) {
    elements.push(...convertFollowLink(text));
  }

  return elements;
};

class RichText extends React.Component {
  componentDidMount() {
    this.props.onBuildContent();
  }

  renderNameHeader() {
      const { user } = this.props;
      const style = EchofonCommon.pref().getIntPref("displayStyle");

      const displayName = (style === DisplayStyles.NAME) ? user.name : user.screen_name;

      return (
        <AnchorText
          additionalClasses="echofon-status-user"
          type="username"
          link={EchofonCommon.userViewURL(user.screen_name)}
          text={displayName}
          screen_name={user.screen_name}
        >
          {displayName}
        </AnchorText>
      );
  }

  render() {
    const { uid, msg, parent_elem } = this.props;
    const style = EchofonCommon.pref().getIntPref("displayStyle");

    const elements = [];
    if (msg.entities) {
      //
      // sort entities.
      //
      const entities = Object.entries(msg.entities)
        .reduce(
          (prev, [type, value]) =>
            prev.concat(value.map(entity => ({ type, value: entity }))),
          []
        )
        .sort((a, b) => a.value.indices[0] - b.value.indices[0]);

      //
      // building tweet with urls, mentions and hashtags.
      //

      var index = 0;
      const e = document.createElement('div');
      e.innerHTML = msg.full_text || msg.text;
      var text = e.textContent;
      for (var i in entities) {
        if (!entities.hasOwnProperty(i)) continue;
        var type = entities[i]['type'];
        var entity = entities[i]['value'];

        var start = entity['indices'][0];
        var end   = entity['indices'][1];
        if (start < index || end < start) continue;

        var left = substring(text, index, start);
        if (left) {
          elements.push(left);
        }
        var linked_text = substring(text, start, end);
        var a;
        switch (type) {
          case "urls":
            if (entity['display_url']) {
              linked_text = entity['display_url'];
            }
            var url = entity['url'];
            var expanded_url = entity['expanded_url'];
            a = (
              <AnchorText
                link={expanded_url ? expanded_url : url}
                text={linked_text}
                type="link"
                url={url}
                expanded_url={expanded_url}
              >
                {linked_text}
              </AnchorText>
            );
            break;

          case "user_mentions":
            a = (
              <AnchorText
                link={EchofonCommon.userViewURL(entity['screen_name'])}
                text={linked_text}
                type="username"
                screen_name={`@${entity['screen_name']}`}
                attr={entity['id'] === uid ? 'replies' : undefined}
              >
                {linked_text}
              </AnchorText>
            );
            break;

          case "hashtags":
            a = (
              <AnchorText
                link={`#${entity['text']}`}
                text={linked_text}
                type="hashtag"
              >
                {linked_text}
              </AnchorText>
            );
            break;

          case "media":
            if (entity.type == "photo") {
              if (entity['display_url']) {
                linked_text = entity['display_url'];
              }
              var url = entity['url'];
              var expanded_url = entity['expanded_url'];
              a = (
                <AnchorText
                  link={expanded_url ? expanded_url : url}
                  text={linked_text}
                  type="link"
                  url={url}
                  expanded_url={expanded_url}
                >
                {linked_text}
              </AnchorText>
              );
            }
            break;
          default:
            break;
        }
        elements.push(a);
        index = entity['indices'][1];
      }
      if (text && index < length(text)) {
        elements.push(substring(text, index, length(text)));
      }
    } else {
      elements.push(...convertLinksWithRegExp(msg.full_text || msg.text));
    }

    // When display style is set to both screen_name and name, a new container is created
    // meanwhile when set to only one, it's rendered inline with the message body.
    // This will change as we refactor every component later.

    return (
      <description className="echofon-status-body" ref="node">
        {style !== DisplayStyles.BOTH && this.renderNameHeader()}
        {style !== DisplayStyles.BOTH && ' '}
        {elements}
      </description>
    );
  }
}

export default RichText;