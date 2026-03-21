import React, { useRef, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  View,
} from 'react-native';
import { colors, radius, typography } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
}

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: PrimaryButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    haptics.light();
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  };

  const isDisabled = disabled || loading;

  const btnStyle = [
    styles.btn,
    variant === 'outline' && styles.btnOutline,
    variant === 'ghost' && styles.btnGhost,
    isDisabled && variant === 'primary' && styles.btnDisabled,
    isDisabled && variant === 'outline' && styles.btnOutlineDisabled,
  ];

  const textStyle = [
    styles.label,
    variant === 'outline' && styles.labelOutline,
    variant === 'ghost' && styles.labelGhost,
    isDisabled && styles.labelDisabled,
  ];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={1}
        style={btnStyle}
        accessibilityLabel={loading ? 'Cargando' : label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.white : colors.black} size="small" />
        ) : (
          <Text style={textStyle}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.black,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    height: 44,
  },
  btnDisabled: {
    backgroundColor: colors.disabledBg,
  },
  btnOutlineDisabled: {
    borderColor: colors.disabled,
  },
  label: {
    ...typography.button,
    color: colors.white,
  },
  labelOutline: {
    color: colors.black,
  },
  labelGhost: {
    color: colors.black,
  },
  labelDisabled: {
    color: colors.disabled,
  },
});
