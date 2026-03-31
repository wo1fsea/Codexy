"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  LOCALE_STORAGE_KEY,
  getIntlLocale,
  resolveLocale,
  resolveLocaleFromNavigator,
  translate,
  type DockLocale,
  type MessageKey,
  type MessageVars,
  type TranslateFn
} from "@/lib/i18n/messages";

type LocaleOption = {
  value: DockLocale;
  label: string;
};

type I18nContextValue = {
  formatDateTime: (unixSeconds: number) => string;
  formatRelativeTime: (unixSeconds: number) => string;
  formatSidebarTime: (unixSeconds: number) => string;
  locale: DockLocale;
  localeOptions: LocaleOption[];
  setLocale: (locale: DockLocale) => void;
  t: TranslateFn;
};

function createTranslator(locale: DockLocale): TranslateFn {
  return (key: MessageKey, vars?: MessageVars) => translate(locale, key, vars);
}

function createDefaultValue(): I18nContextValue {
  const locale = DEFAULT_LOCALE;
  const t = createTranslator(locale);

  return {
    locale,
    setLocale: () => undefined,
    t,
    localeOptions: LOCALE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.nativeLabel
    })),
    formatRelativeTime(unixSeconds) {
      const diff = Date.now() - unixSeconds * 1000;
      const minute = 60_000;
      const hour = minute * 60;
      const day = hour * 24;

      if (diff < hour) {
        return t("time.minutesAgo", {
          count: Math.max(1, Math.round(diff / minute))
        });
      }

      if (diff < day) {
        return t("time.hoursAgo", {
          count: Math.max(1, Math.round(diff / hour))
        });
      }

      return t("time.daysAgo", {
        count: Math.max(1, Math.round(diff / day))
      });
    },
    formatSidebarTime(unixSeconds) {
      const diff = Date.now() - unixSeconds * 1000;
      const minute = 60_000;
      const hour = minute * 60;
      const day = 24 * hour;

      if (diff < hour) {
        return t("time.minutesCompact", {
          count: Math.max(1, Math.round(diff / minute))
        });
      }

      if (diff < day) {
        return t("time.hoursCompact", {
          count: Math.max(1, Math.round(diff / hour))
        });
      }

      return t("time.daysCompact", {
        count: Math.max(1, Math.round(diff / day))
      });
    },
    formatDateTime(unixSeconds) {
      return new Intl.DateTimeFormat(getIntlLocale(locale), {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric"
      }).format(new Date(unixSeconds * 1000));
    }
  };
}

const I18nContext = createContext<I18nContextValue>(createDefaultValue());

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DockLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const nextLocale = stored
      ? resolveLocale(stored)
      : resolveLocaleFromNavigator(window.navigator.languages);

    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = getIntlLocale(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = createTranslator(locale);
    const intlLocale = getIntlLocale(locale);

    return {
      locale,
      setLocale(nextLocale) {
        setLocaleState(resolveLocale(nextLocale));
      },
      t,
      localeOptions: LOCALE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.nativeLabel
      })),
      formatRelativeTime(unixSeconds) {
        const diff = Date.now() - unixSeconds * 1000;
        const minute = 60_000;
        const hour = minute * 60;
        const day = hour * 24;

        if (diff < hour) {
          return t("time.minutesAgo", {
            count: Math.max(1, Math.round(diff / minute))
          });
        }

        if (diff < day) {
          return t("time.hoursAgo", {
            count: Math.max(1, Math.round(diff / hour))
          });
        }

        return t("time.daysAgo", {
          count: Math.max(1, Math.round(diff / day))
        });
      },
      formatSidebarTime(unixSeconds) {
        const diff = Date.now() - unixSeconds * 1000;
        const minute = 60_000;
        const hour = minute * 60;
        const day = 24 * hour;

        if (diff < hour) {
          return t("time.minutesCompact", {
            count: Math.max(1, Math.round(diff / minute))
          });
        }

        if (diff < day) {
          return t("time.hoursCompact", {
            count: Math.max(1, Math.round(diff / hour))
          });
        }

        return t("time.daysCompact", {
          count: Math.max(1, Math.round(diff / day))
        });
      },
      formatDateTime(unixSeconds) {
        return new Intl.DateTimeFormat(intlLocale, {
          hour: "2-digit",
          minute: "2-digit",
          month: "short",
          day: "numeric"
        }).format(new Date(unixSeconds * 1000));
      }
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
