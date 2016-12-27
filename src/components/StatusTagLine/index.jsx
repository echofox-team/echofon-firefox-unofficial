import React from 'react';

import AnchorText from '../AnchorText';

const StatusTagLine = ({ msg, fontSize, appMode, user }) => {
  let infoChildren = [];

  if (msg.metadata && msg.metadata.result_type === "popular") {
    infoChildren.push(<description className="echofon-top-tweet">Top Tweet</description>);
  }

  const permalink = (msg.retweeted_status_id) ? msg.retweeted_status_id : msg.id;
  const label = EchofonCommon.getLocalTimeForDate(msg.created_at, appMode !== 'window' && msg.type !== 'user-timeline');
  const time = (
    <AnchorText
      className="echofon-status-timestamp"
      type="link"
      link={EchofonCommon.twitterURL(user.screen_name + "/statuses/" + permalink)}
      text={label}
      created_at={new Date(msg.created_at).getTime()}
      label={label}
    >
      {label}
    </AnchorText>
  );
  infoChildren.push(time);

  if (msg.source) {
    if (msg.source.match(/<a href\=\"([^\"]*)\"[^>]*>(.*)<\/a>/)) {
      const source = EchofonCommon.formatText({
        type: 'via',
        children: (
          <AnchorText className="echofon-source-link" type="app" link={RegExp.$1} text={RegExp.$2}>
            {RegExp.$2}
          </AnchorText>
        ),
      });

      infoChildren.push(<box>{' '}</box>, ...source); // whitespace box hack, if better, plz tell us
    }
  }
  if (msg.place) {
    if (appMode === 'window') {
      infoChildren.push(EchofonCommon.getFormattedString('from', [msg.place.full_name]));
    } else {
      infoChildren.push(<image className="echofon-place-icon" />, msg.place.full_name);
    }
  }
  if (msg.in_reply_to_status_id && msg.in_reply_to_screen_name) {
    const link = EchofonCommon.twitterURL(msg.in_reply_to_screen_name + '/statuses/' + msg.in_reply_to_status_id);
    if (appMode === 'window' || msg.type === 'user-timeline') {
      const text = EchofonCommon.getFormattedString('inReplyToInline', [msg.in_reply_to_screen_name]);
      infoChildren.push(
        <AnchorText
          className="echofon-source-link echofon-source-link-left-padding"
          type="tweet-popup"
          link={link}
          text={text}
        >
          {text}
        </AnchorText>
      );
    } else {
      infoChildren.push(
        <AnchorText className="echofon-source-link" type="tweet-popup" link={link}>
          <image className="echofon-in-reply-to-icon" />
          {msg.in_reply_to_screen_name}
        </AnchorText>
      );
    }
  }
  /*
  if (msg.metadata && msg.metadata.result_type === 'popular') {
    if (msg.metadata.recent_retweets) {
      infoChildren.push(
        <description className="echofon-top-tweet-retweets">
          {`, retweeted ${msg.metadata.recent_retweets} times`}
        </description>
      );
    }
  }
  */

  return (
    <echofon-status-tagline style={{ fontSize: (fontSize - 1) + 'px', display: 'block' }}>
      {infoChildren}
    </echofon-status-tagline>
  );
};

export default StatusTagLine;