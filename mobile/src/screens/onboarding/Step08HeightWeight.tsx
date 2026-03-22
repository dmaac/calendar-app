import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import ScrollPicker from '../../components/onboarding/ScrollPicker';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

// ─── Data ────────────────────────────────────────────────────────────────────
const FT_OPTIONS = ['3 ft','4 ft','5 ft','6 ft','7 ft'];
const IN_OPTIONS = Array.from({ length: 12 }, (_, i) => `${i} in`);
const LB_OPTIONS = Array.from({ length: 221 }, (_, i) => `${i + 80} lb`);

const CM_OPTIONS = Array.from({ length: 121 }, (_, i) => `${i + 120} cm`);
const KG_OPTIONS = Array.from({ length: 151 }, (_, i) => `${i + 30} kg`);

// Conversions
const cmToFtIn = (cm: number) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return { ft: Math.max(3, Math.min(7, ft)), inch: Math.max(0, Math.min(11, inch)) };
};
const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54);
const kgToLb = (kg: number) => Math.round(kg * 2.20462);
const lbToKg = (lb: number) => Math.round(lb / 2.20462);

export default function Step08HeightWeight({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, updateMany } = useOnboarding();
  const [unit, setUnit] = useState<'metric' | 'imperial'>(data.unitSystem);

  // Derived display indices
  const { ft, inch } = cmToFtIn(data.heightCm);
  const lb = kgToLb(data.weightKg);

  const handleMetricHeight = (cmIdx: number) => {
    updateMany({ heightCm: cmIdx + 120, unitSystem: 'metric' });
  };
  const handleMetricWeight = (kgIdx: number) => {
    updateMany({ weightKg: kgIdx + 30, unitSystem: 'metric' });
  };
  const handleImperialFt = (ftIdx: number) => {
    const newFt = ftIdx + 3;
    updateMany({ heightCm: ftInToCm(newFt, inch), unitSystem: 'imperial' });
  };
  const handleImperialIn = (inIdx: number) => {
    updateMany({ heightCm: ftInToCm(ft, inIdx), unitSystem: 'imperial' });
  };
  const handleImperialLb = (lbIdx: number) => {
    updateMany({ weightKg: lbToKg(lbIdx + 80), unitSystem: 'imperial' });
  };

  const switchUnit = (newUnit: 'metric' | 'imperial') => {
    setUnit(newUnit);
    updateMany({ unitSystem: newUnit });
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Tu altura y peso</Text>
      <Text style={styles.subtitle}>
        Con estos datos calculamos tu metabolismo basal y calorias diarias.
      </Text>

      {/* Unit toggle */}
      <View style={styles.toggleRow} accessibilityRole="radiogroup">
        {(['imperial', 'metric'] as const).map(u => {
          const label = u === 'imperial' ? 'Imperial (ft, lb)' : 'Metrico (cm, kg)';
          return (
            <TouchableOpacity
              key={u}
              onPress={() => switchUnit(u)}
              style={[styles.toggleBtn, unit === u && styles.toggleBtnActive]}
              activeOpacity={0.8}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.toggleText, unit === u && styles.toggleTextActive]}>
                {u === 'imperial' ? 'Imperial' : 'Metrico'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Pickers */}
      <View style={styles.pickersRow}>
        {unit === 'imperial' ? (
          <>
            <View style={styles.pickerCol} accessibilityLabel="Selector de altura">
              <Text style={styles.pickerLabel}>Altura</Text>
              <View style={styles.pickerPair}>
                <ScrollPicker
                  items={FT_OPTIONS}
                  selectedIndex={ft - 3}
                  onSelect={handleImperialFt}
                  width={90}
                />
                <ScrollPicker
                  items={IN_OPTIONS}
                  selectedIndex={inch}
                  onSelect={handleImperialIn}
                  width={80}
                />
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.pickerCol} accessibilityLabel="Selector de peso">
              <Text style={styles.pickerLabel}>Peso</Text>
              <ScrollPicker
                items={LB_OPTIONS}
                selectedIndex={Math.max(0, Math.min(LB_OPTIONS.length - 1, lb - 80))}
                onSelect={handleImperialLb}
                width={100}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.pickerCol} accessibilityLabel="Selector de altura">
              <Text style={styles.pickerLabel}>Altura</Text>
              <ScrollPicker
                items={CM_OPTIONS}
                selectedIndex={Math.max(0, Math.min(CM_OPTIONS.length - 1, data.heightCm - 120))}
                onSelect={handleMetricHeight}
                width={110}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.pickerCol} accessibilityLabel="Selector de peso">
              <Text style={styles.pickerLabel}>Peso</Text>
              <ScrollPicker
                items={KG_OPTIONS}
                selectedIndex={Math.max(0, Math.min(KG_OPTIONS.length - 1, data.weightKg - 30))}
                onSelect={handleMetricWeight}
                width={110}
              />
            </View>
          </>
        )}
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  toggleBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  toggleBtnActive: { backgroundColor: colors.white },
  toggleText: { ...typography.label, color: colors.black },
  toggleTextActive: { color: colors.black },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  pickerCol: { alignItems: 'center', gap: spacing.sm },
  pickerPair: { flexDirection: 'row', gap: spacing.xs },
  pickerLabel: { ...typography.label, color: colors.black },
  divider: { width: 1, height: 200, backgroundColor: colors.grayLight, marginTop: 28 },
});
