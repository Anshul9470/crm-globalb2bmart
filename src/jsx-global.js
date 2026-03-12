// Global JSX runtime to ensure _jsxDEV is available globally
import React from 'react';

// Make JSX runtime functions available globally
if (typeof window !== 'undefined') {
  window._jsx = (type, props, key) => React.createElement(type, { ...props, key });
  window._jsxs = (type, props, key) => React.createElement(type, { ...props, key });
  window._jsxDEV = (type, props, key, isStaticChildren, source, self) => React.createElement(type, { ...props, key });
  window._Fragment = React.Fragment;
}
