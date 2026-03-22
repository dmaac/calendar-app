import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, MAX_WIDTH } from '../../theme';
import { StepProps } from './OnboardingNavigator';
import FitsiMascot from '../../components/FitsiMascot';

const APP_NAME = 'Fitsi IA';

export default function Step01Splash({ onNext }: StepProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.3)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(10)).current;
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // Phase 1: Mascot + icon bounce in with spring
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 6,
        bounciness: 14,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(iconOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(iconScale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 6,
            bounciness: 16,
          }),
        ]),
      ]),
    ]).start();

    // Phase 2: Typewriter effect on "Fitsi IA" starting at 500ms
    const typewriterDelay = 500;
    const charTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i <= APP_NAME.length; i++) {
      charTimers.push(
        setTimeout(() => {
          setDisplayedText(APP_NAME.slice(0, i));
        }, typewriterDelay + i * 70)
      );
    }

    // Phase 3: Tagline fades in after typewriter completes
    const taglineDelay = typewriterDelay + APP_NAME.length * 70 + 100;
    const taglineTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, taglineDelay);

    // Auto-advance after all animations complete
    const timer = setTimeout(onNext, 2400);
    return () => {
      clearTimeout(timer);
      clearTimeout(taglineTimer);
      charTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <View
      style={styles.root}
      accessibilityLabel="Fitsi IA cargando"
      accessibilityRole="none"
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.centered}>
        <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
          <FitsiMascot expression="excited" size="large" animation="bounce" />
          <View style={styles.logoRow}>
            <Animated.View style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
              <Ionicons name="flame" size={44} color={colors.accent} />
            </Animated.View>
            <Text style={styles.appName}>{displayedText}<Text style={styles.cursor}>|</Text></Text>
          </View>
          <Animated.Text
            style={[
              styles.tagline,
              { opacity: taglineOpacity, transform: [{ translateY: taglineTranslateY }] },
            ]}
          >
            Tu nutricion inteligente
          </Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appName: {
    ...typography.hero,
    fontSize: 36,
    color: colors.black,
    minWidth: 160,
  },
  cursor: {
    color: colors.accent,
    fontWeight: '300',
  },
  tagline: {
    ...typography.subtitle,
    color: colors.gray,
    marginTop: 8,
  },
});
