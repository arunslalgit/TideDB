import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { basePath } from './config';
import './main.css';

// Detect if we're running in playground mode based on the URL path.
// Playground is served at /playground/* by the Go server.
const isPlayground = window.location.pathname.startsWith(basePath + '/playground');
const routerBasename = isPlayground ? basePath + '/playground' : basePath + '/ui';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
