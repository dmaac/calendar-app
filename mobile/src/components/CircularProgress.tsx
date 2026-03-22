import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Animated SVG Circle — bridges Animated.Value to the strokeDashoffset prop */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  /** Progress value between 0 and 1 */
  progress: number;
  color: string;
  backgroundColor?: string;
  /** Duration of the fill animation in ms. Defaults to 800. */
  animationDuration?: number;
  children?: React.ReactNode;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  size,
  strokeWidth,
  progress,
  color,
  backgroundColor = '#E5E7EB',
  animationDuration = 800,
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  // Animated value drives strokeDashoffset for a smooth fill
  const animatedProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: Math.min(progress, 1),
      duration: animationDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG props cannot use native driver
    }).start();
  }, [progress, animationDuration]);

  // Interpolate from full offset (empty) to reduced offset (filled)
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`Progreso: ${Math.round(Math.min(progress, 1) * 100)} por ciento`}
      accessibilityRole="progressbar"
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated foreground arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
};

export default CircularProgress;
