import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

/** Animated counter that counts from 0 to target */
function AnimatedCounter({ target, suffix = '', style, delay = 0 }: { target: number; suffix?: string; style: any; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: target,
      duration: 800,
      delay,
      useNativeDriver: false,
    }).start();
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [target]);

  return <Text style={style}>{display}{suffix}</Text>;
}

export default function Step14Comparison({ onNext, onBack, step, totalSteps }: StepProps) {
  const withAnim = useRef(new Animated.Value(0)).current;
  const withoutAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const labelFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Fade in the card
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Grow bars with stagger
      Animated.stagger(200, [
        Animated.timing(withoutAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }),
        Animated.timing(withAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
      ]),
      // Fade in labels
      Animated.timing(labelFade, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        Pierde el doble de peso{'\n'}con nuestra app{'\n'}vs. por tu cuenta
      </Text>

      <Animated.View
        style={[styles.card, { opacity: fadeAnim }]}
        accessibilityLabel="Grafico comparativo: sin la app pierdes 20 porciento, con la app pierdes el doble"
      >
        <View style={styles.barsContainer}>
          {/* Without app bar */}
          <View style={styles.barCol}>
            <Text style={styles.barTopLabelGray}>
              Sin{'\n'}nuestra app
            </Text>
            <View style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.bar,
                  styles.barSmall,
                  {
                    height: withoutAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 70],
                    }),
                  },
                ]}
              >
                <AnimatedCounter target={20} suffix="%" style={styles.barValueSmall} delay={700} />
              </Animated.View>
            </View>
          </View>

          {/* With app bar */}
          <View style={styles.barCol}>
            <Text style={styles.barTopLabelDark}>
              Con{'\n'}nuestra app
            </Text>
            <View style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.bar,
                  styles.barLarge,
                  {
                    height: withAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 160],
                    }),
                  },
                ]}
              >
                <Text style={styles.barValueLarge}>2X</Text>
              </Animated.View>
            </View>
          </View>
        </View>

        <Animated.Text style={[styles.caption, { opacity: labelFade }]}>
          Nuestra app hace que sea facil y te mantiene comprometido con tu objetivo.
        </Animated.Text>
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.black,
    marginTop: spacing.md,
  },
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
    height: 220,
    paddingTop: 44,
  },
  barCol: {
    alignItems: 'center',
  },
  barTopLabelGray: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  barTopLabelDark: {
    ...typography.caption,
    color: colors.black,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    minHeight: 4,
    overflow: 'hidden',
  },
  barSmall: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.grayLight,
  },
  barLarge: {
    backgroundColor: colors.black,
  },
  barValueSmall: {
    ...typography.titleMd,
    color: colors.black,
  },
  barValueLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  caption: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
  },
});
