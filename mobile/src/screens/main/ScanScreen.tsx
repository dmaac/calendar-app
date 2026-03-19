/**
 * ScanScreen — Pantalla de escaneo de alimentos con IA
 * Rama 3: integración real con cámara + AI Vision.
 * Por ahora: selector de tipo de comida + placeholder de cámara.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, useLayout } from '../../theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: { value: MealType; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'Desayuno', icon: 'sunny-outline',      color: '#F59E0B' },
  { value: 'lunch',     label: 'Almuerzo', icon: 'restaurant-outline',  color: '#10B981' },
  { value: 'dinner',    label: 'Cena',     icon: 'moon-outline',        color: '#6366F1' },
  { value: 'snack',     label: 'Snack',    icon: 'cafe-outline',        color: '#EC4899' },
];

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');

  const handleScan = () => {
    Alert.alert(
      'Próximamente',
      'El escaneo con cámara estará disponible en la siguiente actualización. Usa la galería por ahora.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingHorizontal: sidePadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Escanear comida</Text>
        <Text style={styles.subtitle}>Fotografía tu plato y la IA detectará los nutrientes</Text>
      </View>

      {/* Camera preview area */}
      <View style={[styles.cameraArea, { width: contentWidth - sidePadding * 2 }]}>
        <View style={styles.cameraCornerTL} />
        <View style={styles.cameraCornerTR} />
        <View style={styles.cameraCornerBL} />
        <View style={styles.cameraCornerBR} />

        <TouchableOpacity style={styles.cameraButton} onPress={handleScan} activeOpacity={0.8}>
          <Ionicons name="camera" size={40} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.cameraHint}>Toca para escanear</Text>
      </View>

      {/* Meal type selector */}
      <Text style={styles.sectionLabel}>¿Qué comida es?</Text>
      <View style={styles.mealTypes}>
        {MEAL_TYPES.map((mt) => {
          const isSelected = selectedMeal === mt.value;
          return (
            <TouchableOpacity
              key={mt.value}
              style={[styles.mealChip, isSelected && styles.mealChipActive]}
              onPress={() => setSelectedMeal(mt.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={mt.icon as any}
                size={16}
                color={isSelected ? colors.white : mt.color}
              />
              <Text style={[styles.mealChipText, isSelected && styles.mealChipTextActive]}>
                {mt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Scan CTA */}
      <TouchableOpacity style={styles.mainBtn} onPress={handleScan} activeOpacity={0.8}>
        <Ionicons name="camera-outline" size={20} color={colors.white} />
        <Text style={styles.mainBtnText}>Abrir cámara</Text>
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoRow}>
        <Ionicons name="flash-outline" size={14} color={colors.gray} />
        <Text style={styles.infoText}>Análisis en menos de 5 segundos · Potenciado por IA</Text>
      </View>
    </View>
  );
}

const CORNER = 20;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typography.titleMd,
    color: colors.black,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 20,
  },
  cameraArea: {
    aspectRatio: 1,
    maxHeight: 280,
    backgroundColor: '#0A0A0A',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    gap: spacing.sm,
  },
  cameraCornerTL: {
    position: 'absolute', top: 16, left: 16,
    width: CORNER, height: CORNER,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: colors.white, borderRadius: 4,
  },
  cameraCornerTR: {
    position: 'absolute', top: 16, right: 16,
    width: CORNER, height: CORNER,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: colors.white, borderRadius: 4,
  },
  cameraCornerBL: {
    position: 'absolute', bottom: 16, left: 16,
    width: CORNER, height: CORNER,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: colors.white, borderRadius: 4,
  },
  cameraCornerBR: {
    position: 'absolute', bottom: 16, right: 16,
    width: CORNER, height: CORNER,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: colors.white, borderRadius: 4,
  },
  cameraButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionLabel: {
    ...typography.label,
    color: colors.black,
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  mealTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  mealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  mealChipActive: {
    backgroundColor: colors.black,
  },
  mealChipText: {
    ...typography.label,
    color: colors.black,
  },
  mealChipTextActive: {
    color: colors.white,
  },
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.black,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    width: '100%',
    justifyContent: 'center',
  },
  mainBtnText: {
    ...typography.button,
    color: colors.white,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  infoText: {
    ...typography.caption,
    color: colors.gray,
  },
});
