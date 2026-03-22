/**
 * ErrorBoundary — Global React error boundary for Fitsi IA
 *
 * Catches unhandled JS errors anywhere in the component tree and shows a
 * friendly fallback screen featuring:
 *   - Fitsi mascot with "sad" expression
 *   - "Reintentar" button that resets state
 *   - "Reportar error" button that opens email with error details
 *   - Dark mode support via ThemeContext
 *   - Full accessibility labels
 *   - Dev-only debug section with error + component stack
 *
 * Usage (App.tsx):
 *   import ErrorBoundary from './src/components/ErrorBoundary';
 *   <ErrorBoundary>
 *     <RestOfApp />
 *   </ErrorBoundary>
 */
import React, { Component, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors, darkColors, typography, spacing, radius } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ─── Themed Fallback (functional component for hooks) ─────────────────────────

/**
 * ErrorFallbackScreen — The actual error UI, extracted as a functional component
 * so we can use useColorScheme for dark mode support.
 *
 * Note: We intentionally avoid useAppTheme() here because the ErrorBoundary
 * wraps ThemeProvider in App.tsx — ThemeContext may not be available when
 * this renders. We fall back to the OS color scheme instead.
 */
function ErrorFallbackScreen({
  error,
  errorInfo,
  onRetry,
}: {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onRetry: () => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? darkColors : lightColors;

  const handleReport = () => {
    const errorMessage = error?.toString() ?? 'Unknown error';
    const stack = errorInfo?.componentStack ?? 'No stack trace';
    const subject = encodeURIComponent('Fitsi App - Reporte de error');
    const body = encodeURIComponent(
      `Hola equipo Fitsi,\n\n` +
      `La app mostro un error inesperado.\n\n` +
      `--- Detalles tecnicos ---\n` +
      `Error: ${errorMessage}\n\n` +
      `Stack:\n${stack.slice(0, 1000)}\n\n` +
      `--- Fin ---\n\n` +
      `Descripcion de lo que estaba haciendo:\n`
    );
    Linking.openURL(`mailto:support@fitsi.app?subject=${subject}&body=${body}`);
  };

  // We use the FitsiMascot via a dynamic require to avoid circular dependency
  // issues since ErrorBoundary sits at the root of the tree. If the image
  // fails to load, we degrade gracefully to a simple icon.
  let MascotComponent: React.ComponentType<any> | null = null;
  try {
    MascotComponent = require('./FitsiMascot').default;
  } catch {
    // Mascot unavailable — will fall back to icon
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: c.bg }]}
      accessibilityRole="alert"
      accessibilityLabel="Ocurrio un error en la aplicacion"
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Mascot or fallback icon */}
        {MascotComponent ? (
          <MascotComponent
            expression="sad"
            size="large"
            animation="sad"
            disableTouch
          />
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2E1A1A' : '#FFF0ED' }]}>
            <Ionicons name="sad-outline" size={44} color={c.accent} />
          </View>
        )}

        {/* Copy */}
        <Text style={[styles.title, { color: c.black }]}>
          Algo salio mal
        </Text>
        <Text style={[styles.subtitle, { color: c.gray }]}>
          Ocurrio un error inesperado. Puedes reintentar o reportar el problema
          para que lo solucionemos lo antes posible.
        </Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          {/* Retry CTA (primary) */}
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.black }]}
            onPress={onRetry}
            activeOpacity={0.85}
            accessibilityLabel="Reintentar"
            accessibilityRole="button"
            accessibilityHint="Intenta cargar la aplicacion de nuevo"
          >
            <Ionicons name="refresh" size={18} color={c.white} />
            <Text style={[styles.retryBtnText, { color: c.white }]}>
              Reintentar
            </Text>
          </TouchableOpacity>

          {/* Report CTA (secondary) */}
          <TouchableOpacity
            style={[
              styles.reportBtn,
              { borderColor: c.grayLight, backgroundColor: c.surface },
            ]}
            onPress={handleReport}
            activeOpacity={0.85}
            accessibilityLabel="Reportar error"
            accessibilityRole="button"
            accessibilityHint="Abre tu email para enviar un reporte de error al equipo de Fitsi"
          >
            <Ionicons name="mail-outline" size={18} color={c.accent} />
            <Text style={[styles.reportBtnText, { color: c.accent }]}>
              Reportar error
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error detail (shown only in __DEV__) */}
        {__DEV__ && error && (
          <View style={[styles.debugBox, { backgroundColor: c.surface }]}>
            <Text style={[styles.debugTitle, { color: c.accent }]}>
              Error (solo visible en dev)
            </Text>
            <Text style={[styles.debugMessage, { color: c.black }]}>
              {error.toString()}
            </Text>
            {errorInfo?.componentStack && (
              <Text
                style={[styles.debugStack, { color: c.gray }]}
                numberOfLines={20}
              >
                {errorInfo.componentStack}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Class Component (required for error boundary lifecycle) ──────────────────

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the full error so it shows up in Metro / crash reporting tools.
    // TODO (production): replace with Sentry.captureException(error, { extra: errorInfo })
    console.error('[ErrorBoundary] Unhandled JS error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  render(): ReactNode {
    if (this.state.hasError) {
      // Allow the parent to inject a completely custom fallback.
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallbackScreen
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 60,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    alignItems: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    borderRadius: radius.full,
    width: '100%',
    maxWidth: 280,
    minHeight: 52,
  },
  retryBtnText: {
    ...typography.button,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    width: '100%',
    maxWidth: 280,
    minHeight: 48,
  },
  reportBtnText: {
    ...typography.label,
  },
  // Dev-only debug section
  debugBox: {
    marginTop: 40,
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  debugMessage: {
    fontSize: 12,
    fontFamily: 'monospace' as any,
    marginBottom: spacing.sm,
  },
  debugStack: {
    fontSize: 10,
    fontFamily: 'monospace' as any,
  },
});
