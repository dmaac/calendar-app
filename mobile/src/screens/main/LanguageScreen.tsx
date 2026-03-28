/**
 * LanguageScreen — Fitsi AI style language selector with flags and circular check
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useTranslation } from '../../context/LanguageContext';

interface Language {
  code: string;
  label: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'zh', label: '\u4E2D\u56FD\u4EBA', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'hi', label: '\u0939\u093F\u0928\u094D\u0926\u0940', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'es', label: 'Espa\u00F1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', label: 'Fran\u00E7ais', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'pt', label: 'Portugu\u00EAs', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'it', label: 'Italiano', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'ro', label: 'Rom\u00E2n\u0103', flag: '\u{1F1F7}\u{1F1F4}' },
  { code: 'az', label: 'Azerbaycanca', flag: '\u{1F1E6}\u{1F1FF}' },
  { code: 'nl', label: 'Nederlands', flag: '\u{1F1F3}\u{1F1F1}' },
];

export default function LanguageScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { locale, setLocale, t } = useTranslation();

  const handleSelect = (code: string) => {
    haptics.light();
    setLocale(code);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.grayLight }]}>
        <Text style={[styles.headerTitle, { color: c.black }]}>{t('language.selectLanguage')}</Text>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={20} color={c.black} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.listCard, { backgroundColor: c.surface }]}>
          {LANGUAGES.map((lang, index) => {
            const isSelected = lang.code === locale;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langRow,
                  index < LANGUAGES.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: c.grayLight,
                  },
                ]}
                onPress={() => handleSelect(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.langLabel, { color: c.black }]}>{lang.label}</Text>
                {isSelected && (
                  <View style={[styles.checkCircle, { backgroundColor: c.success }]}>
                    <Ionicons name="checkmark" size={14} color={c.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.titleSm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  listCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  flag: {
    fontSize: 24,
  },
  langLabel: {
    ...typography.bodyMd,
    flex: 1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#34A853', // overridden inline with c.success
    alignItems: 'center',
    justifyContent: 'center',
  },
});
