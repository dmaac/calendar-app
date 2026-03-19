import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

export default function Step14Comparison({ onNext, onBack, step, totalSteps }: StepProps) {
  const withAnim = useRef(new Animated.Value(0)).current;
  const withoutAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(withoutAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: false }),
      Animated.timing(withAnim, { toValue: 1, duration: 800, delay: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Pierde el doble de peso{'\n'}con nuestra app{'\n'}vs. por tu cuenta</Text>

      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        <View style={styles.barsContainer}>
          {/* Without app bar */}
          <View style={styles.barCol}>
            <Text style={styles.barTopLabel}>Sin{'\n'}nuestra app</Text>
            <View style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.bar,
                  styles.barSmall,
                  {
                    height: withoutAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }),
                  },
                ]}
              >
                <Text style={styles.barValueSmall}>20%</Text>
              </Animated.View>
            </View>
          </View>

          {/* With app bar */}
          <View style={styles.barCol}>
            <Text style={[styles.barTopLabel, { color: colors.black }]}>Con{'\n'}nuestra app</Text>
            <View style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.bar,
                  styles.barLarge,
                  {
                    height: withAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 160] }),
                  },
                ]}
              >
                <Text style={styles.barValueLarge}>2X</Text>
              </Animated.View>
            </View>
          </View>
        </View>

        <Text style={styles.caption}>
          Nuestra app lo hace fácil y te mantiene comprometido.
        </Text>
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: spacing.xl,
    height: 200,
  },
  barCol: { alignItems: 'center', gap: spacing.sm },
  barTopLabel: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
    position: 'absolute',
    top: 0,
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: 40,
  },
  bar: {
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    minHeight: 4,
    overflow: 'hidden',
  },
  barSmall: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.grayLight },
  barLarge: { backgroundColor: colors.black },
  barValueSmall: { ...typography.titleMd, color: colors.gray },
  barValueLarge: { fontSize: 28, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  caption: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
});
