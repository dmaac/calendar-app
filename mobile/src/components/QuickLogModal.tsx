/**
 * QuickLogModal — Bottom sheet modal for quick food logging.
 *
 * Appears when user taps "Registro rapido" from an intervention.
 * Shows 3 options: "Scan comida", "Agregar favorito", "Copiar ayer".
 * Each navigates to the corresponding screen/action.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';

interface QuickLogModalProps {
  visible: boolean;
  onClose: () => void;
  onScanComida: () => void;
  onAgregarFavorito: () => void;
  onCopiarAyer: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = 280;

const OPTIONS = [
  {
    key: 'scan',
    label: 'Scan comida',
    subtitle: 'Toma una foto y registra al instante',
    icon: 'camera' as const,
    color: '#4285F4',
  },
  {
    key: 'favorite',
    label: 'Agregar favorito',
    subtitle: 'Elige de tus comidas guardadas',
    icon: 'heart' as const,
    color: '#EC4899',
  },
  {
    key: 'copy',
    label: 'Copiar ayer',
    subtitle: 'Replica las comidas de ayer',
    icon: 'copy' as const,
    color: '#F59E0B',
  },
] as const;

function QuickLogModal({
  visible,
  onClose,
  onScanComida,
  onAgregarFavorito,
  onCopiarAyer,
}: QuickLogModalProps) {
  const c = useThemeColors();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SHEET_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const handlePress = (key: 'scan' | 'favorite' | 'copy') => {
    haptics.light();
    onClose();
    if (key === 'scan') onScanComida();
    else if (key === 'favorite') onAgregarFavorito();
    else onCopiarAyer();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: c.bg, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: c.grayLight }]} />
          </View>

          <Text style={[styles.title, { color: c.black }]}>Registro rapido</Text>

          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.option, { backgroundColor: c.surface }]}
              onPress={() => handlePress(opt.key)}
              activeOpacity={0.7}
              accessibilityLabel={opt.label}
              accessibilityRole="button"
            >
              <View style={[styles.iconCircle, { backgroundColor: opt.color + '18' }]}>
                <Ionicons name={opt.icon} size={22} color={opt.color} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, { color: c.black }]}>{opt.label}</Text>
                <Text style={[styles.optionSubtitle, { color: c.gray }]}>{opt.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.gray} />
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

export default React.memo(QuickLogModal);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  optionSubtitle: {
    ...typography.caption,
  },
});
