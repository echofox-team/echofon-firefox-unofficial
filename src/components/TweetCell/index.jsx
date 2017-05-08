import React from 'react';

import * as DisplayStyles from '../../constants/display-style';

import AnchorText from '../AnchorText';
import RichText from '../RichText';
import StatusTagLine from '../StatusTagLine';

const getPhotoFromText = function(msg) {
  var text = (msg.full_text || msg.text).replace(/&amp;/g,"&");
  var photo = {};

  var pat = /((https?\:\/\/|www\.)[^\s]+)([^\w\s\d]*)/g;
  var re = /[!.,;:)}\]]+$/;

  while (pat.exec(text) != null) {
    var url = RegExp.$1;
    if (re.test(url)) {
      url = url.replace(re, '');
    }

    var urltext = url;
    if (url.length > 27) {
      urltext = url.substr(0, 27) + "...";
    }
    var pb = new EchofonPhotoBackend(urltext);
    if (pb.isPhotoURL()) {
      photo = {
        statusPhoto: urltext,
        pb,
      };
    }
    pat.lastIndex = 0;
  }

  return photo;
};

const getPhotoFromEntities = function(msg) {
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

  var photo = {};

  var index = 0;
  var text = msg.full_text || msg.text;
  for (var i in entities) {
    if (!entities.hasOwnProperty(i)) continue;
    var type = entities[i]['type'];
    var entity = entities[i]['value'];

    var start = entity['indices'][0];
    var end   = entity['indices'][1];
    if (start < index || end < start) continue;

    switch (type) {
      case "urls":
        var pb = new EchofonPhotoBackend(entity['expanded_url'] ? entity['expanded_url'] : entity['url']);
        if (pb.isPhotoURL()) {
          photo = {
            statusPhoto: entity['expanded_url'] ? entity['expanded_url'] : entity['url'],
            pb,
          };
        }
        break;

      case "media":
        if (entity.type == "photo") {
          var pb = EchofonPhotoBackend.initWithEntity(entity);
          photo = {
            statusPhoto: entity['url'],
            pb,
          };
        }
        break;
      default:
        break;
    }
    index = entity['indices'][1];
  }

  return photo;
};

class TweetCell extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      tweet: props.tweet,
      containerWidth: window.innerWidth - 16,
      padding: 10 + 32 + 5 + 18 + 5, // left avator spacing icons right
      requestFavorite: false,
      favorited: !!props.tweet.favorited,
      thumbnailPhoto: undefined,
      mode: undefined,
      border: undefined,
      hovering: false,
    };

    this.setRetweet = this.setRetweet.bind(this);
    this.setFavorited = this.setFavorited.bind(this);
    this.toggleFavorite = this.toggleFavorite.bind(this);
    this.loadImage = this.loadImage.bind(this);
    this.openPhoto = this.openPhoto.bind(this);
    this.handleReplyButton = this.handleReplyButton.bind(this);
  }

  componentDidMount() {
    const { uid, tweet, highlighted } = this.props;
    const { node } = this;
    let { padding } = this.state;

    node.createdAt   = new Date(tweet.retweeted_status_id || tweet.created_at).getTime();
    node.unread      = tweet.unread;
    node.tweet       = tweet;
    node.uid         = uid;
    node.user        = tweet.user;
    node.highlighted = highlighted;
    node.appMode     = EchofonCommon.pref().getCharPref("applicationMode");

    if (node.pb) {
      padding += 64;
    }
    if (node.getAttribute("user-timeline")) {
      padding += 24;
    }
    else if (EchofonCommon.pref().getCharPref("applicationMode") !== 'window') {
      padding  -= (8+5);
      if (node.pb) {
        padding -= 12;
      }
    }

    node.padding = padding;

    node.doRetweet = this.setRetweet;
    node.undoRetweet = this.setRetweet;
    node.setFavorited = this.setFavorited;
    node.toggleFavorite = this.toggleFavorite;
    node.loadImage = this.loadImage;
    node.openPhoto = this.openPhoto;

    node.watch('border', function (id, oldval, border) {
      this.setState((state) => {
        if (state.border != border) {
          return {border};
        }
      });
    });

    node.addEventListener('mouseover', () => {
      if (window.gScrollTimer) {
        window.gHoveredCell = this.state.node;
        return;
      }
      this.setState({ hovering: true });
    });
    node.addEventListener('mouseout', () => {
      this.setState({ hovering: false });
    });

    this.setState({node, padding});
  }

  setRetweet(tweet) {
    this.state.node.tweet = tweet;

    this.setState({tweet});
  }

  setFavorited(favorited) {
    const { node } = this.state;

    this.setState({
      requestFavorite: false,
      favorited: !!favorited,
    });
  }

  toggleFavorite() {
    const { node, favorited } = this.state;

    this.setState({ requestFavorite: true });

    EchofonCommon.notify('setFavorite', {
      id: this.state.tweet.id,
      method: favorited ? 'destroy' : 'create',
    });
  }

  loadImage(url) {
    this.setState({ thumbnailPhoto: url });
  }

  openPhoto(event) {
    const { node } = this.state;

    var url = node.getAttribute("status-photo");
    var win = EchofonCommon.isWindowExist(url);
    if (win) {
      win.focus();
    }
    else {
      if (node.pb.media == EchofonPhotoBackend.MEDIA_TYPE_VIDEO) {
        EchofonCommon.openURL(url, event);
      }
      else {
        EchofonCommon.openPhotoView(node.pb);
      }
    }
  }

  handleReplyButton() {
    reply(this.state.node, this.state.tweet);
  }

  render() {
    const { uid, id, highlighted } = this.props;
    const {
      tweet,
      containerWidth,
      padding,
      favorited,
      requestFavorite,
      thumbnailPhoto,
      mode,
      border,
      hovering,
    } = this.state;
    const appMode = EchofonCommon.pref().getCharPref("applicationMode");
    const fontSize = EchofonCommon.fontSize();
    const msg = tweet;
    const { user } = tweet;

    const { statusPhoto, pb } = msg.entities ? getPhotoFromEntities(msg) : getPhotoFromText(msg);

    const attrs = {
      id,
      messageId: tweet.id,
      type: tweet.type,
      ref: (node) => {
        if (node) {
          node.padding = padding;
          if (!node.getAttribute("user-timeline")) {
            node.setAttribute("mode", appMode);
          }

          if (pb && !this.state.thumbnailPhoto) {
            node.pb = pb;
            this.setState({thumbnailPhoto: pb.thumbnailURL(node)});
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
      requestFavorite,
      favorited,
      favoriteButtonTooltip: EchofonCommon.getString(msg.favorited ? "UnfavoriteTweet" : "FavoriteTweet"),
      isFavorited: (msg.favorited) ? 'block' : 'none',
      text: msg.full_text,
      protected: user.protected ? 1 : 0,
      highlighted: msg.has_mention && msg.type == 'home' || undefined,
      is_own_retweet: msg.retweeted_status_id > 0 && msg.retweeter_user_id == uid || undefined,
      'thumbnail-photo': thumbnailPhoto,
      mode,
      border: this.state.node && this.state.node.border,
      'status-photo': statusPhoto,
    };

    const style = EchofonCommon.pref().getIntPref("displayStyle");

    const XULVbox = 'xul:vbox';
    const XULHbox = 'xul:hbox';
    const XULDescription = 'xul:description';
    const XULBox = 'xul:box';
    const XULSpacer = 'xul:spacer';
    const XULImage = 'xul:image';
    const XULStack = 'xul:stack';

    const namesProps = {
      link: EchofonCommon.userViewURL(user.screen_name),
      text: user.name,
      type: 'username',
      screen_name: user.screen_name,
    };

    return (
      <echofon-status {...attrs}>

        <XULVbox>
          <XULBox
            className="echofon-status-usericon"
            style={{ background: `url(${user.profile_image_url})` }}
            href={EchofonCommon.userViewURL(user.screen_name)}
            ref={(node) => {
              if (node) {
                node.user = user;
                node.setAttribute('anonid', 'usericon');
                node.setAttribute('tooltip', 'echofon-user-tooltip');
                node.setAttribute('align', 'top');
              }
            }}
          />
          <XULSpacer ref={(node) => node && node.setAttribute('flex', 1)} />
        </XULVbox>

        <XULVbox className="echofon-status-message-container" ref={(node) => node && node.setAttribute('flex', '1')}>
          <XULDescription className="echofon-status-message">

            {style === DisplayStyles.BOTH && (
              <description className="echofon-status-body" /*style={{ width: `${containerWidth - padding}px` }}*/>
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

            <RichText
              className="echofon-status-body"
              uid={uid}
              msg={msg}
              user={user}
            />

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
                      key="retweeter-link"
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

        <XULVbox
          className="echofon-function-icon-box"
          ref={node => node && node.setAttribute('align', 'end')}
        >
          <XULImage
            className="echofon-status-favorite"
            type={tweet.type}
            style={{
              display: favorited || hovering ? 'block' : 'none',
            }}
            ref={node => {
              if (node) {
                node.setAttribute('anonid', 'favorite');
                node.setAttribute('favorited', favorited);
                node.setAttribute('messageId', tweet.id);
                if (this.state.node) node.setAttribute('attr', this.state.node.getAttribute('attr'));
                node.setAttribute('tooltiptext', attrs.favoriteButtonTooltip);
                node.setAttribute('requestFavorite', requestFavorite);

                node.addEventListener('click', this.toggleFavorite);
              }
            }}
          />
          <XULImage
            style={{
              display: hovering ? 'block' : 'none',
            }}
            className="echofon-status-reply"
            name={user.screen_name}
            type={tweet.type}
            ref={node => {
              if (node) {
                node.setAttribute('anonid', 'reply');
                node.setAttribute('messageId', tweet.id);
                node.setAttribute('attr', this.state.node && this.state.node.getAttribute('attr'));
                node.setAttribute('text', tweet.text);
                node.setAttribute('tooltiptext', attrs.replyButtonTooltip);

                node.addEventListener('click', this.handleReplyButton);
              }
            }}
          />
        </XULVbox>

        <XULVbox ref={node => node && node.setAttribute('flex', '1')}>
          <XULStack
            ref={node => {
              if (node) {
                node.setAttribute('flex', '1');

                node.addEventListener('click', this.openPhoto);
              }
            }}
          >
            <XULImage
              ref={node => node && node.setAttribute('anonid', 'thumbnail-photo')}
              className="echofon-status-photo"
              src={thumbnailPhoto}
            />
            <XULHbox ref={node => node && node.setAttribute('align', 'center')}>
              <XULSpacer ref={node => node && node.setAttribute('flex', '1')}/>
              <XULImage
                ref={node => node && node.setAttribute('anonid', 'video-playback-icon')}
                className="echofon-status-video-playback-icon"
                style={{
                  display: (this.state.node && pb) && pb.thumbnailURL(this.state.node).match(/(twitvid|youtube|youtu\.be)/) && 'block',
                }}
              />
              <XULSpacer ref={node => node && node.setAttribute('flex', '1')}/>
            </XULHbox>
          </XULStack>
        </XULVbox>

      </echofon-status>
    );
  }
}

export default TweetCell;
