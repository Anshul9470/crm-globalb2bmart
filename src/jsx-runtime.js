// Custom JSX runtime to ensure _jsxDEV is available
import React from 'react';

// Export the JSX runtime functions that React expects
export const jsx = (type, props, key) => {
  return React.createElement(type, { ...props, key });
};

export const jsxs = (type, props, key) => {
  return React.createElement(type, { ...props, key });
};

export const jsxDEV = (type, props, key, isStaticChildren, source, self) => {
  return React.createElement(type, { ...props, key });
};

export const Fragment = React.Fragment;
