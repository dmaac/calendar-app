import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, MAX_WIDTH } from '../../theme';
import { StepProps } from './OnboardingNavigator';

export default function Step01Splash({ onNext }: StepProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Auto-avanzar después de 1.8s
    const timer = setTimeout(onNext, 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.centered}>
        <Animated.View style={[styles.content, { opacity }]}>
          <View style={styles.logoRow}>
            <Ionicons name="calendar" size={44} color={colors.black} />
            <Text style={styles.appName}>Fitsi</Text>
          </View>
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
    fontSize: 36,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: -1,
  },
});
