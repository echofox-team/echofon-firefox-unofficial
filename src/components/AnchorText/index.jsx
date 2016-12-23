import React from 'react';

const AnchorText = ({ children, link, text, type, className : defaultClasses = 'echofon-hyperlink', additionalClasses, style, screen_name, created_at, label }) => {
  const className = additionalClasses ? defaultClasses + ' ' + additionalClasses : defaultClasses;
  const setXULAttributes = (node) => {
    if (node) {
      node.setAttribute('text', text);
      node.setAttribute('tooltip', 'echofon-tooltip');
      if (screen_name) node.setAttribute('screen_name', screen_name);
      if (created_at) node.setAttribute('created_at', created_at);
      if (label) node.setAttribute('label', label);
    }
  };

  return (
    <label style={style} className={className} href={link} type={type} ref={setXULAttributes}>
      {children}
    </label>
  );
};

export default AnchorText;