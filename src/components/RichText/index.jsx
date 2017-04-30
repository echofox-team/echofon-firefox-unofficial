import React from 'react';
import { substring, length } from 'stringz';

import AnchorText from '../AnchorText';

import * as DisplayStyles from '../../constants/display-style';

class RichText extends React.Component {
  componentDidMount() {
    const { uid, msg, parent_elem } = this.props;

    if (msg.entities) {
      EchofonCommon.convertLinksWithEntitiesNew(uid, msg, this.refs.node, parent_elem);
    }
    else {
      EchofonCommon.convertLinksWithRegExp(uid, msg, this.refs.node, parent_elem);
    }

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
      var text = msg.full_text || msg.text;
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