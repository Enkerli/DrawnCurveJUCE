// Injected first by esbuild — exposes React as globals so design files
// (which use React.useState, React.useEffect etc. without importing) work correctly.
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
