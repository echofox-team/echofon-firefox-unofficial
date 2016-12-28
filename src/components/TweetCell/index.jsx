import React from 'react';

import * as DisplayStyles from '../../constants/display-style';

import AnchorText from '../AnchorText';
import RichText from '../RichText';
import StatusTagLine from '../StatusTagLine';

class TweetCell extends React.Component {
  constructor() {
    super();

    this.state = {};
  }

  componentDidMount() {
    const { uid, tweet, highlighted } = this.props;

    this.node.createdAt   = new Date(tweet.retweeted_status_id || tweet.created_at).getTime();
    this.node.unread      = tweet.unread;
    this.node.tweet       = tweet;
    this.node.uid         = uid;
    this.node.user        = tweet.user;
    this.node.highlighted = highlighted;
    this.node.appMode     = EchofonCommon.pref().getCharPref("applicationMode");

    this.setState({node: this.node});
  }

  render() {
    const { uid, id, tweet, highlighted } = this.props;
    const appMode = EchofonCommon.pref().getCharPref("applicationMode");
    const fontSize = EchofonCommon.fontSize();
    const msg = tweet;
    const { user } = tweet;
    const attrs = {
      id,
      messageId: tweet.id,
      type: tweet.type,
      highlighted,
      ref: (node) => {
        if (node) {
          if (!node.getAttribute("user-timeline")) {
            node.setAttribute("mode", appMode);
          }
          this.node = node;
        }
      },
      style: {
        fontSize: fontSize + 'px',
        fontFamily: EchofonCommon.pref().getCharPref("fontFace"),
      },
      profile_image_url: user.profile_image_url,
      href: EchofonCommon.userViewURL(user.screen_name),
      replyButtonTooltip: EchofonCommon.getFormattedString("ReplyTo", [user.screen_name]),
      screen_name: user.screen_name,
      is_own_tweet: user.id === uid || undefined,
      name: user.name,
      requestFavorite: false,
      favorited: msg.favorited,
      favoriteButtonTooltip: EchofonCommon.getString(msg.favorited ? "UnfavoriteTweet" : "FavoriteTweet"),
      isFavorited: (msg.favorited) ? 'block' : 'none',
      text: msg.full_text,
      protected: user.protected ? 1 : 0,
      highlighted: msg.has_mention && msg.type == 'home' || undefined,
      is_own_retweet: msg.retweeted_status_id > 0 && msg.retweeter_user_id == uid || undefined,
    };

    const style = EchofonCommon.pref().getIntPref("displayStyle");

    const XULVbox = 'xul:vbox';
    const XULHbox = 'xul:hbox';
    const XULDescription = 'xul:description';

    const namesProps = {
      link: EchofonCommon.userViewURL(user.screen_name),
      text: user.name,
      type: 'username',
      screen_name: user.screen_name,
    };

    return (
      <echofon-status {...attrs}>
        <XULVbox className="echofon-status-message-container" ref={(node) => node && node.setAttribute('flex', '1')}>
          <XULDescription className="echofon-status-message">

            {style === DisplayStyles.BOTH && (
              <description className="echofon-status-body">
                <AnchorText additionalClasses="echofon-status-user" {...namesProps}>
                  {user.name}
                </AnchorText>
                <AnchorText
                  style={msg.type != 'user-timeline' ? {
                    fontSize: (fontSize - 1) + 'px',
                  } : undefined}
                  className="echofon-status-additional-screen-name"
                  {...namesProps}
                >
                  {`@${user.screen_name}`}
                </AnchorText>
              </description>
            )}

            {this.state.node && <RichText
              className="echofon-status-body"
              uid={uid}
              msg={msg}
              user={user}
              parent_elem={this.state.node}
            />}

          </XULDescription>
          <XULHbox className="echofon-status-info" ref={(node) => {
            if (node) {
              node.setAttribute('crop', 'right');
              node.setAttribute('align', 'left');
            }
          }}>
            <StatusTagLine msg={msg} fontSize={fontSize} appMode={appMode} user={user} />
          </XULHbox>
          <XULHbox className="echofon-status-info">
            {msg.retweeted_status_id > 0 && (
              <echofon-status-retweet-status anonid="retweet" style={{fontSize: (fontSize - 1) + 'px'}}>
                <image className="echofon-retweet-icon" />
                {
                  EchofonCommon.formatText({type: 'retweetedBy', children: (
                    <AnchorText
                      link={EchofonCommon.userViewURL(msg.retweeter_screen_name)}
                      text={msg.retweeter_user_id == uid ? EchofonCommon.getString("you") : msg.retweeter_screen_name}
                      screen_name={msg.retweeter_screen_name}
                      type="username"
                    >
                      {msg.retweeter_user_id == uid ? EchofonCommon.getString("you") : msg.retweeter_screen_name}
                    </AnchorText>
                  )})
                }
              </echofon-status-retweet-status>
            )}
          </XULHbox>
        </XULVbox>
      </echofon-status>
    );
  }
}

export default TweetCell;