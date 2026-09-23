import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui';

/** Açık/koyu tema. Başlangıç değeri index.html'deki betiğin koyduğu `data-theme`'den okunur. */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#100e14' : '#6a1bf7');
    try { localStorage.setItem('sprott-theme', theme); } catch { /* Tema, depolama kapalıyken de çalışır. */ }
  }, [dark]);
  return <Button type="button" variant="outline" size="icon" className="theme-toggle"
    aria-label="Koyu tema" aria-pressed={dark} title={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    onClick={() => setDark(value => !value)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</Button>;
}
