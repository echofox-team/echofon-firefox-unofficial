import React from 'react';

// this should be elsewhere
const DISPLAY_STYLE_BOTH = 0;
const DISPLAY_STYLE_NAME = 1;
const DISPLAY_STYLE_SCREEN_NAME = 2;

class RichText extends React.Component {
  componentDidMount() {
    const { uid, msg, parent_elem } = this.props;

    if (msg.entities) {
      return EchofonCommon.convertLinksWithEntities(uid, msg, this.refs.node, parent_elem);
    }
    else {
      return EchofonCommon.convertLinksWithRegExp(uid, msg, this.refs.node, parent_elem);
    }
  }

  renderNameHeader() {
      const { user } = this.props;
      const style = EchofonCommon.pref().getIntPref("displayStyle");

      const displayName = (style === DISPLAY_STYLE_NAME) ? user.name : user.screen_name;

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
    const style = EchofonCommon.pref().getIntPref("displayStyle");

    // When display style is set to both screen_name and name, a new container is created
    // meanwhile when set to only one, it's rendered inline with the message body.
    // This will change as we refactor every component later.

    return (
      <description className="echofon-status-body" ref="node">
        {style !== DISPLAY_STYLE_BOTH && this.renderNameHeader()}
        {style !== DISPLAY_STYLE_BOTH && ' '}
        {/* appended when component mount, this will change */}
      </description>
    );
  }
}

export default RichText;