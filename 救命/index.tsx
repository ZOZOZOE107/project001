import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can sometimes cause double-initialization issues with physics engines in dev.
  // We'll keep it but our useEffect cleanup handles it.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);