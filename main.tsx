import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './app/page';
import 'flag-icons/css/flag-icons.min.css';
import './app/globals.css';
import './components/tactical.css';
createRoot(document.getElementById('root')!).render(<Home/>);
