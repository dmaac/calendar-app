import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography, spacing } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

interface OptionCardProps {
  label: string;
  subtitle?: string;
  icon?: string;           // nombre de Ionicon
  emoji?: string;          // emoji como alternativa al icon
  selected: boolean;
  onPress: () => void;
  rightElement?: React.ReactNode;
}

export default function OptionCard({
  label,
  subtitle,
  icon,
  emoji,
  selected,
  onPress,
  rightElement,
}: OptionCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    haptics.selection();
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={[styles.card, selected && styles.cardSelected]}
        accessibilityLabel={`${label}${subtitle ? `, ${subtitle}` : ''}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        {/* Ícono izquierdo */}
        {(icon || emoji) && (
          <View style={styles.iconContainer}>
            {emoji ? (
              <Text style={styles.emoji}>{emoji}</Text>
            ) : (
              <Ionicons
                name={icon as any}
                size={20}
                color={selected ? colors.white : colors.black}
              />
            )}
          </View>
        )}

        {/* Texto */}
        <View style={styles.textContainer}>
          <Text style={[styles.label, selected && styles.labelSelected]}>
            {label}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Derecha: checkmark o elemento custom */}
        {rightElement ?? (
          selected ? (
            <Ionicons name="checkmark" size={18} color={colors.white} />
          ) : null
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
    gap: spacing.sm + 4,
  },
  cardSelected: {
    backgroundColor: colors.black,
  },
  iconContainer: {
    width: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    ...typography.option,
    color: colors.black,
  },
  labelSelected: {
    color: colors.white,
  },
  subtitle: {
    ...typography.caption,
    color: colors.black,
    marginTop: 2,
  },
  subtitleSelected: {
    color: 'rgba(255,255,255,0.9)',
  },
});
