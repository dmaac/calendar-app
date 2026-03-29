/**
 * LevelUpOverlay — Full-screen semi-transparent overlay for level up celebration.
 * Large level number animation (scale up + glow), level name text,
 * FitsiMascot with "celebrate" expression. Auto-dismiss after 3 seconds or tap.
 * Uses Animated API (no Reanimated).
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';
import FitsiMascot from './FitsiMascot';

interface LevelUpOverlayProps {
  visible: boolean;
  levelNumber: number;
  levelName: string;
  xpEarned?: number;
  coinsEarned?: number;
  onDismiss: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LevelUpOverlay = React.memo(function LevelUpOverlay({
  visible,
  levelNumber,
  levelName,
  xpEarned = 0,
  coinsEarned = 0,
  onDismiss,
}: LevelUpOverlayProps) {
  const c = useThemeColors();

  // Animation values
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const levelScale = useRef(new Animated.Value(0.3)).current;
  const levelGlow = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const rewardsTranslateY = useRef(new Animated.Value(30)).current;
  const rewardsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      haptics.success();

      // Reset values
      overlayOpacity.setValue(0);
      levelScale.setValue(0.3);
      levelGlow.setValue(0);
      textOpacity.setValue(0);
      rewardsTranslateY.setValue(30);
      rewardsOpacity.setValue(0);

      // Sequence: overlay fade in -> level scale up -> text fade -> rewards slide up
      Animated.sequence([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(levelScale, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(rewardsOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(rewardsTranslateY, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Glow pulse loop
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(levelGlow, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(levelGlow, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      glowLoop.start();

      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 3000);

      return () => {
        clearTimeout(timer);
        glowLoop.stop();
      };
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <TouchableWithoutFeedback onPress={handleDismiss}>
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        accessibilityLabel={`Felicidades! Subiste al nivel ${levelNumber}, ${levelName}`}
        accessibilityRole="alert"
      >
        {/* Level number with glow */}
        <Animated.View
          style={[
            styles.levelCircle,
            {
              transform: [{ scale: levelScale }],
              opacity: levelGlow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.85, 1],
              }),
            },
          ]}
        >
          <View style={styles.levelInner}>
            <Text style={styles.levelLabel}>NIVEL</Text>
            <Text style={styles.levelNumber}>{levelNumber}</Text>
          </View>
        </Animated.View>

        {/* Level name + congratulations */}
        <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
          <Text style={styles.congratsText}>Felicidades!</Text>
          <Text style={styles.levelNameText}>{levelName}</Text>
        </Animated.View>

        {/* Mascot */}
        <FitsiMascot
          expression="party"
          size="medium"
          animation="bounce"
        />

        {/* Rewards earned */}
        {(xpEarned > 0 || coinsEarned > 0) && (
          <Animated.View
            style={[
              styles.rewardsRow,
              {
                opacity: rewardsOpacity,
                transform: [{ translateY: rewardsTranslateY }],
              },
            ]}
          >
            {xpEarned > 0 && (
              <View style={styles.rewardItem}>
                <Ionicons name="star" size={18} color="#4285F4" />
                <Text style={styles.rewardValue}>+{Math.round(xpEarned)} XP</Text>
              </View>
            )}
            {coinsEarned > 0 && (
              <View style={styles.rewardItem}>
                <Ionicons name="ellipse" size={16} color="#FBBF24" />
                <Text style={styles.rewardValue}>+{Math.round(coinsEarned)}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Tap to dismiss hint */}
        <Animated.Text style={[styles.dismissHint, { opacity: textOpacity }]}>
          Toca para continuar
        </Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
});

export default LevelUpOverlay;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    gap: spacing.lg,
  },
  levelCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#4285F4',
  },
  levelInner: {
    alignItems: 'center',
  },
  levelLabel: {
    color: '#6BA5FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  levelNumber: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 52,
  },
  textContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  congratsText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  levelNameText: {
    color: '#6BA5FF',
    fontSize: 18,
    fontWeight: '600',
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  rewardValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dismissHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '500',
    position: 'absolute',
    bottom: 60,
  },
});
