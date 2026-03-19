import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../theme';

interface ProgressBarProps {
  step: number;        // paso actual (base 1, desde el primer paso con barra)
  totalSteps: number;
}

// Los primeros 2 pasos (splash + welcome) no muestran barra
// La barra empieza en el paso 3 (index 2)
const FIRST_STEP_WITH_BAR = 3;

export default function ProgressBar({ step, totalSteps }: ProgressBarProps) {
  const progress = Math.max(0, Math.min(1,
    (step - FIRST_STEP_WITH_BAR) / (totalSteps - FIRST_STEP_WITH_BAR)
  ));

  const animatedWidth = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterpolated = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '100%'],
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width: widthInterpolated }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: colors.grayLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    backgroundColor: colors.black,
    borderRadius: 2,
  },
});
