import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './forma-design-v1.css';

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && !window.location.href.startsWith('https://localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
