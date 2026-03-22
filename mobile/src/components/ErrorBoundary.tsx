/**
 * ErrorBoundary — Global React error boundary for Fitsi IA
 *
 * Catches unhandled JS errors anywhere in the component tree and shows a
 * friendly "Algo salió mal" fallback screen with a "Reintentar" button that
 * resets state and lets the user try again.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

// ─── Component ────────────────────────────────────────────────────────────────

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
        <View style={styles.screen}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {/* Icon */}
            <View style={styles.iconCircle}>
              <Ionicons name="warning-outline" size={44} color="#4285F4" />
            </View>

            {/* Copy */}
            <Text style={styles.title}>Algo salió mal</Text>
            <Text style={styles.subtitle}>
              Ocurrió un error inesperado. Toca "Reintentar" para volver a
              intentarlo. Si el problema persiste, cierra y vuelve a abrir la app.
            </Text>

            {/* Retry CTA */}
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={this.handleRetry}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </TouchableOpacity>

            {/* Error detail (shown only in __DEV__) */}
            {__DEV__ && this.state.error && (
              <View style={styles.debugBox}>
                <Text style={styles.debugTitle}>Error (solo visible en dev)</Text>
                <Text style={styles.debugMessage}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.debugStack} numberOfLines={20}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
  },
  retryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Dev-only debug section
  debugBox: {
    marginTop: 40,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4285F4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  debugMessage: {
    fontSize: 12,
    color: '#111111',
    fontFamily: 'monospace' as any,
    marginBottom: 8,
  },
  debugStack: {
    fontSize: 10,
    color: '#8E8E93',
    fontFamily: 'monospace' as any,
  },
});
