'use client';

import {useEffect} from 'react';

const RTL = new Set(['fa', 'ar']);

export default function LocaleDocument() {
  useEffect(() => {
    const stored = window.localStorage.getItem('market-intelligence-locale');
    const browser = (navigator.language || 'en').toLowerCase().split('-')[0];
    const locale = stored || (['fa', 'en', 'ar', 'de', 'es', 'fr', 'tr', 'ru', 'zh', 'ja'].includes(browser) ? browser : 'en');
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL.has(locale) ? 'rtl' : 'ltr';
    document.documentElement.dataset.locale = locale;
  }, []);

  return null;
}
