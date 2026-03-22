import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import en from './locales/en';
import es from './locales/es';
import pt from './locales/pt';

const i18n = new I18n({ en, es, pt });

// Detect device locale, fallback to 'en'
const deviceLocale = getLocales()?.[0]?.languageCode ?? 'en';
i18n.locale = deviceLocale;
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;
