import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Toaster } from './components/toaster';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Toaster/><App/></React.StrictMode>);
