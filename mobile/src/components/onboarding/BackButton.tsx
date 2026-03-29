import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface BackButtonProps {
  onPress: () => void;
}

export default function BackButton({ onPress }: BackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.btn}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel="Volver al paso anterior"
      accessibilityRole="button"
    >
      <Ionicons name="chevron-back" size={20} color={colors.black} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
