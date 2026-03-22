/**
 * FitsiMascot — Reusable animated mascot component with 37 expressions.
 * Renders Fitsi (penguin) with smooth animations and touchable interactivity.
 *
 * Animations:
 * - idle: gentle breathing (scale pulse)
 * - bounce: spring jump up/down
 * - wave: tilt side to side
 * - celebrate: jump + scale burst + haptic
 * - thinking: slow sway
 * - sad: shrink down
 * - none: static
 *
 * Touch interactivity:
 * - Tap Fitsi for haptic + random expression + random tip bubble
 * - Returns to original expression after 1.5s
 *
 * Optional speech bubble via `message` prop.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';

// ─── Image sources ─────────────────────────────────────────────────────────
const EXPRESSION_IMAGES: Record<FitsiExpression, any> = {
  // Root mascot variants
  strong: require('../../assets/mascot/fitsi-strong.png'),
  cute: require('../../assets/mascot/fitsi-cute.png'),
  // Expression PNGs from assets/mascot/expressions/
  neutral: require('../../assets/mascot/expressions/fitsi-neutral.png'),
  question: require('../../assets/mascot/expressions/fitsi-question.png'),
  cool: require('../../assets/mascot/expressions/fitsi-cool.png'),
  wink: require('../../assets/mascot/expressions/fitsi-wink.png'),
  love: require('../../assets/mascot/expressions/fitsi-love.png'),
  doctor: require('../../assets/mascot/expressions/fitsi-doctor.png'),
  happy: require('../../assets/mascot/expressions/fitsi-happy.png'),
  angry: require('../../assets/mascot/expressions/fitsi-angry.png'),
  sleepy: require('../../assets/mascot/expressions/fitsi-sleepy.png'),
  star: require('../../assets/mascot/expressions/fitsi-star.png'),
  sick: require('../../assets/mascot/expressions/fitsi-sick.png'),
  crying: require('../../assets/mascot/expressions/fitsi-crying.png'),
  blush: require('../../assets/mascot/expressions/fitsi-blush.png'),
  thinking: require('../../assets/mascot/expressions/fitsi-thinking.png'),
  surprised: require('../../assets/mascot/expressions/fitsi-surprised.png'),
  excited: require('../../assets/mascot/expressions/fitsi-excited.png'),
  dizzy: require('../../assets/mascot/expressions/fitsi-dizzy.png'),
  scared: require('../../assets/mascot/expressions/fitsi-scared.png'),
  laugh: require('../../assets/mascot/expressions/fitsi-laugh.png'),
  proud: require('../../assets/mascot/expressions/fitsi-proud.png'),
  hungry: require('../../assets/mascot/expressions/fitsi-hungry.png'),
  sad: require('../../assets/mascot/expressions/fitsi-sad.png'),
  chef: require('../../assets/mascot/expressions/fitsi-chef.png'),
  party: require('../../assets/mascot/expressions/fitsi-party.png'),
  sweat: require('../../assets/mascot/expressions/fitsi-sweat.png'),
  freeze: require('../../assets/mascot/expressions/fitsi-freeze.png'),
  fire: require('../../assets/mascot/expressions/fitsi-fire.png'),
  splash: require('../../assets/mascot/expressions/fitsi-splash.png'),
  zen: require('../../assets/mascot/expressions/fitsi-zen.png'),
  muscle: require('../../assets/mascot/expressions/fitsi-muscle.png'),
  ninja: require('../../assets/mascot/expressions/fitsi-ninja.png'),
  angel: require('../../assets/mascot/expressions/fitsi-angel.png'),
  devil: require('../../assets/mascot/expressions/fitsi-devil.png'),
  crown: require('../../assets/mascot/expressions/fitsi-crown.png'),
  // Variants from fitsi-happy.png (use cute as fallback for now)
  amigable: require('../../assets/mascot/fitsi-cute.png'),
  fitness: require('../../assets/mascot/fitsi-strong.png'),
};

// ─── Size map ──────────────────────────────────────────────────────────────
const SIZE_MAP = {
  small: 40,
  medium: 80,
  large: 120,
  hero: 200,
} as const;

// ─── Random tips for touch interactivity ──────────────────────────────────
const FITSI_TIPS = [
  'Bebe agua cada 2 horas!',
  'La proteina es clave despues del ejercicio',
  'Registra cada comida para mejor precision',
  'Caminar 30 min quema ~150 calorias',
  'Duerme 7-8 horas para mejor metabolismo',
  'Las frutas son snacks perfectos',
  'No te saltes el desayuno!',
  'La consistencia es mas importante que la perfeccion',
];

// Expressions to randomly show on tap (fun/positive ones)
const RANDOM_EXPRESSIONS: FitsiExpression[] = [
  'happy', 'excited', 'wink', 'star', 'love', 'laugh',
  'cool', 'party', 'blush', 'proud', 'muscle', 'ninja',
  'angel', 'crown', 'fire', 'zen', 'surprised',
];

// ─── Types ─────────────────────────────────────────────────────────────────
export type FitsiExpression =
  | 'strong' | 'cute'
  | 'neutral' | 'question' | 'cool' | 'wink' | 'love'
  | 'doctor' | 'happy' | 'angry' | 'sleepy' | 'star'
  | 'sick' | 'crying' | 'blush' | 'thinking' | 'surprised'
  | 'excited' | 'dizzy' | 'scared' | 'laugh' | 'proud'
  | 'hungry' | 'sad' | 'chef' | 'party' | 'sweat'
  | 'freeze' | 'fire' | 'splash' | 'zen' | 'muscle'
  | 'ninja' | 'angel' | 'devil' | 'crown'
  | 'amigable' | 'fitness';

/** @deprecated Use `expression` prop instead. Kept for backward compatibility. */
export type FitsiVariant = 'strong' | 'cute';
export type FitsiSize = 'small' | 'medium' | 'large' | 'hero';
export type FitsiAnimation =
  | 'idle'
  | 'bounce'
  | 'wave'
  | 'celebrate'
  | 'thinking'
  | 'sad'
  | 'none';

interface FitsiMascotProps {
  /** New expression system — overrides `variant` if provided. */
  expression?: FitsiExpression;
  /** @deprecated Use `expression` instead. Falls back to this if expression is not set. */
  variant?: FitsiVariant;
  size?: FitsiSize;
  animation?: FitsiAnimation;
  message?: string;
  /** Disable touch interactivity (e.g. in chat avatars) */
  disableTouch?: boolean;
  style?: any;
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function FitsiMascot({
  expression,
  variant = 'cute',
  size = 'medium',
  animation = 'idle',
  message,
  disableTouch = false,
  style,
}: FitsiMascotProps) {
  const c = useThemeColors();
  const px = SIZE_MAP[size];

  // Resolve the active expression: prefer `expression`, fall back to `variant`
  const baseExpression: FitsiExpression = expression ?? variant;

  // Touch interactivity state
  const [activeExpression, setActiveExpression] = useState<FitsiExpression>(baseExpression);
  const [tipMessage, setTipMessage] = useState<string | undefined>(message);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when props change
  useEffect(() => {
    // Only update if not in a touch-override state
    if (!touchTimerRef.current) {
      setActiveExpression(baseExpression);
    }
  }, [baseExpression]);

  useEffect(() => {
    if (!touchTimerRef.current) {
      setTipMessage(message);
    }
  }, [message]);

  const handleTouch = useCallback(() => {
    if (disableTouch) return;

    // Haptic feedback
    haptics.light();

    // Clear any existing timer
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }

    // Pick random expression (different from current)
    let randomExpr: FitsiExpression;
    do {
      randomExpr = RANDOM_EXPRESSIONS[Math.floor(Math.random() * RANDOM_EXPRESSIONS.length)];
    } while (randomExpr === activeExpression && RANDOM_EXPRESSIONS.length > 1);

    // Pick random tip
    const randomTip = FITSI_TIPS[Math.floor(Math.random() * FITSI_TIPS.length)];

    setActiveExpression(randomExpr);
    setTipMessage(randomTip);

    // Revert after 1.5 seconds
    touchTimerRef.current = setTimeout(() => {
      setActiveExpression(baseExpression);
      setTipMessage(message);
      touchTimerRef.current = null;
    }, 1500);
  }, [disableTouch, activeExpression, baseExpression, message]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }
    };
  }, []);

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset all animations
    scaleAnim.setValue(1);
    translateYAnim.setValue(0);
    rotateAnim.setValue(0);

    let loop: Animated.CompositeAnimation | null = null;

    switch (animation) {
      case 'idle': {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.03,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1.0,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        );
        loop.start();
        break;
      }
      case 'bounce': {
        loop = Animated.loop(
          Animated.sequence([
            Animated.spring(translateYAnim, {
              toValue: -12,
              friction: 3,
              tension: 80,
              useNativeDriver: true,
            }),
            Animated.spring(translateYAnim, {
              toValue: 0,
              friction: 3,
              tension: 80,
              useNativeDriver: true,
            }),
          ]),
        );
        loop.start();
        break;
      }
      case 'wave': {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 600,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: -1,
              duration: 600,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: 0,
              duration: 400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        );
        loop.start();
        break;
      }
      case 'celebrate': {
        haptics.success();
        Animated.parallel([
          Animated.sequence([
            Animated.spring(translateYAnim, {
              toValue: -20,
              friction: 3,
              tension: 100,
              useNativeDriver: true,
            }),
            Animated.spring(translateYAnim, {
              toValue: 0,
              friction: 4,
              tension: 80,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.15,
              duration: 300,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1.0,
              friction: 4,
              tension: 80,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
        break;
      }
      case 'thinking': {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 0.5,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: -0.5,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        );
        loop.start();
        break;
      }
      case 'sad': {
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
        break;
      }
      case 'none':
      default:
        break;
    }

    return () => {
      loop?.stop();
    };
  }, [animation]);

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-5deg', '0deg', '5deg'],
  });

  const imageSource = EXPRESSION_IMAGES[activeExpression];

  const mascotContent = (
    <View style={[styles.container, style]}>
      {/* Speech bubble */}
      {tipMessage ? (
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: c.surface,
              borderColor: c.grayLight,
              maxWidth: Math.max(px * 2.5, 160),
            },
          ]}
        >
          <Text style={[styles.bubbleText, { color: c.black }]} numberOfLines={3}>
            {tipMessage}
          </Text>
          <View
            style={[
              styles.bubbleArrow,
              { borderTopColor: c.surface },
            ]}
          />
        </View>
      ) : null}

      {/* Mascot image */}
      <Animated.View
        style={{
          transform: [
            { translateY: translateYAnim },
            { scale: scaleAnim },
            { rotate },
          ],
        }}
      >
        <Image
          source={imageSource}
          style={{ width: px, height: px }}
          resizeMode="contain"
          accessibilityLabel={`Fitsi mascota ${activeExpression}`}
        />
      </Animated.View>
    </View>
  );

  // Wrap in touchable unless disabled or size is too small for meaningful interaction
  if (disableTouch || size === 'small') {
    return mascotContent;
  }

  return (
    <TouchableOpacity
      onPress={handleTouch}
      activeOpacity={0.9}
      accessibilityLabel="Toca a Fitsi para un tip"
      accessibilityRole="button"
    >
      {mascotContent}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  bubble: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    position: 'relative',
  },
  bubbleText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  bubbleArrow: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
