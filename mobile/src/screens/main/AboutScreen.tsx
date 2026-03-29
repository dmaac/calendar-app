/**
 * AboutScreen — App info, version, credits, and links
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';

const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '1';

const LINKS = [
  { icon: 'globe-outline', label: 'Website', url: 'https://fitsi.app' },
  { icon: 'logo-instagram', label: 'Instagram', url: 'https://instagram.com/fitsiai' },
  { icon: 'logo-twitter', label: 'Twitter / X', url: 'https://x.com/fitsiai' },
  { icon: 'mail-outline', label: 'Soporte', url: 'mailto:support@fitsi.app' },
];

export default function AboutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Acerca de</Text>
        <View style={[styles.backButton, { backgroundColor: 'transparent' }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.logoSection}>
          <Text style={[styles.appName, { color: c.black }]}>Fitsi AI</Text>
          <Text style={[styles.version, { color: c.gray }]}>
            Version {APP_VERSION} ({BUILD_NUMBER})
          </Text>
        </View>

        {/* Tagline */}
        <View style={[styles.card, { backgroundColor: c.bg }]}>
          <Text style={[styles.tagline, { color: c.black }]}>
            Tu asistente de nutricion con inteligencia artificial.
          </Text>
          <Text style={[styles.madeWith, { color: c.gray }]}>
            Hecho con amor en Chile 🇨🇱
          </Text>
        </View>

        {/* Links */}
        <View style={[styles.card, { backgroundColor: c.bg }]}>
          {LINKS.map((link, index) => (
            <TouchableOpacity
              key={link.label}
              style={[
                styles.row,
                index < LINKS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.grayLight,
                },
              ]}
              onPress={() => Linking.openURL(link.url)}
              activeOpacity={0.6}
            >
              <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
                <Ionicons name={link.icon as any} size={18} color={c.accent} />
              </View>
              <Text style={[styles.rowLabel, { color: c.black }]}>{link.label}</Text>
              <Ionicons name="open-outline" size={16} color={c.disabled} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Legal */}
        <View style={[styles.card, { backgroundColor: c.bg }]}>
          <TouchableOpacity
            style={[
              styles.row,
              { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight },
            ]}
            onPress={() => navigation.navigate('PrivacyPolicy')}
            activeOpacity={0.6}
          >
            <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
            </View>
            <Text style={[styles.rowLabel, { color: c.black }]}>Politica de privacidad</Text>
            <Ionicons name="chevron-forward" size={16} color={c.disabled} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.row,
              { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight },
            ]}
            onPress={() => navigation.navigate('TermsOfService')}
            activeOpacity={0.6}
          >
            <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
              <Ionicons name="document-text-outline" size={18} color="#6366F1" />
            </View>
            <Text style={[styles.rowLabel, { color: c.black }]}>Terminos de servicio</Text>
            <Ionicons name="chevron-forward" size={16} color={c.disabled} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              Linking.openURL('https://github.com/nickvarez/fitsi-mobile/blob/main/LICENSES.md')
            }
            activeOpacity={0.6}
          >
            <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
              <Ionicons name="code-slash-outline" size={18} color={c.gray} />
            </View>
            <Text style={[styles.rowLabel, { color: c.black }]}>Licencias open source</Text>
            <Ionicons name="open-outline" size={16} color={c.disabled} />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={[styles.footer, { color: c.gray }]}>
          {'\u00A9'} {new Date().getFullYear()} Fitsi AI. Todos los derechos reservados.
        </Text>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  version: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xs,
  },
  madeWith: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
