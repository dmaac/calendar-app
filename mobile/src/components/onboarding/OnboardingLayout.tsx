/**
 * OnboardingLayout — wrapper universal para todos los 30 módulos
 * Maneja: SafeArea, responsive max-width, header (back + progress bar), scroll opcional
 */
import React, { ReactNode } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { colors, spacing, MAX_WIDTH, useLayout } from '../../theme';
import ProgressBar from './ProgressBar';
import BackButton from './BackButton';

interface OnboardingLayoutProps {
  children: ReactNode;
  step: number;               // paso actual (1-30)
  totalSteps?: number;        // default 30
  showHeader?: boolean;       // false en splash y welcome
  showBack?: boolean;         // false en splash, welcome, y pantallas sin retroceso
  onBack?: () => void;
  scrollable?: boolean;       // true cuando el contenido puede ser largo
  keyboardAware?: boolean;    // true cuando hay TextInput
}

export default function OnboardingLayout({
  children,
  step,
  totalSteps = 30,
  showHeader = true,
  showBack = true,
  onBack,
  scrollable = false,
  keyboardAware = false,
}: OnboardingLayoutProps) {
  const { contentWidth, isWeb } = useLayout();

  const containerStyle = [
    styles.safe,
    isWeb && { alignItems: 'center' as const },
  ];

  const innerStyle = [
    styles.inner,
    { width: contentWidth },
  ];

  const content = (
    <SafeAreaView style={containerStyle}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {/* Contenedor centrado en web */}
      <View style={innerStyle}>

        {/* Header: back + progress bar */}
        {showHeader && (
          <View style={styles.header}>
            {showBack && onBack
              ? <BackButton onPress={onBack} />
              : <View style={styles.backPlaceholder} />
            }
            <View style={styles.progressWrapper}>
              <ProgressBar step={step} totalSteps={totalSteps} />
            </View>
            <View style={styles.backPlaceholder} />
          </View>
        )}

        {/* Contenido del paso */}
        {scrollable ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.content}>
            {children}
          </View>
        )}
      </View>
    </SafeAreaView>
  );

  if (keyboardAware) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{content}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  progressWrapper: {
    flex: 1,
  },
  backPlaceholder: {
    width: 36,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120, // espacio para el botón flotante
  },
});
