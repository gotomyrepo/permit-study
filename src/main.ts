import './styles.css';
import { loadLessons } from './content/load';
import { loadChapters } from './reader/load';
import { App } from './app';

void new App(document.getElementById('app')!, loadLessons(), loadChapters()).start();
