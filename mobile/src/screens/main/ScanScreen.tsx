/**
 * ScanScreen — Escaneo de alimentos con IA
 * Flujo: seleccionar imagen (camara/galeria) -> subir al backend -> ver resultado -> confirmar log
 *
 * UX Polish:
 * - Scale animation on result card appearance
 * - Haptic feedback on scan complete, confirm, meal selection
 * - Full accessibility labels and roles on all interactive elements
 * - Fade-in animation for scanning/result states
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Animated,
  Easing,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import * as foodService from '../../services/food.service';
import { FoodScanResult } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { haptics } from '../../hooks/useHaptics';
import usePulse from '../../hooks/usePulse';
import { useAnalytics } from '../../hooks/useAnalytics';
import SuccessCheckmark from '../../components/SuccessCheckmark';
import HealthScore from '../../components/HealthScore';
import FitsiMascot from '../../components/FitsiMascot';
import ErrorFallback from '../../components/ErrorFallback';

const FREE_SCAN_LIMIT = 3;

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ScanState = 'idle' | 'scanning' | 'result' | 'error' | 'logged';

const MEAL_TYPES: { value: MealType; labelKey: string; icon: string; color: string }[] = [
  { value: 'breakfast', labelKey: 'scan.breakfast', icon: 'sunny-outline',      color: '#F59E0B' },
  { value: 'lunch',     labelKey: 'scan.lunch',     icon: 'restaurant-outline',  color: '#10B981' },
  { value: 'dinner',    labelKey: 'scan.dinner',    icon: 'moon-outline',        color: '#6366F1' },
  { value: 'snack',     labelKey: 'scan.snack',     icon: 'cafe-outline',        color: '#EC4899' },
];

/** Compute a basic health score (1-10) from macro balance.
 *  Ideal ratio: ~30% protein, ~40% carbs, ~30% fat by calories. */
function computeHealthScore(calories: number, proteinG: number, carbsG: number, fatG: number): number {
  if (calories <= 0) return 5;
  const pCal = proteinG * 4;
  const cCal = carbsG * 4;
  const fCal = fatG * 9;
  const total = pCal + cCal + fCal || 1;
  const pRatio = pCal / total;
  const cRatio = cCal / total;
  const fRatio = fCal / total;
  // Distance from ideal ratios (lower is better)
  const dist = Math.abs(pRatio - 0.3) + Math.abs(cRatio - 0.4) + Math.abs(fRatio - 0.3);
  // Map 0..1 distance to 10..1 score
  const raw = 10 - dist * 10;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

// ─── Macro pill ───────────────────────────────────────────────────────────────
function MacroPill({
  label,
  value,
  unit,
  color,
  grayColor,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  grayColor: string;
}) {
  return (
    <View
      style={[styles.macroPill, { borderColor: color + '40', backgroundColor: color + '10' }]}
      accessibilityLabel={`${label}: ${Math.round(value)} ${unit}`}
    >
      <Text style={[styles.macroPillValue, { color }]}>{Math.round(value)}{unit}</Text>
      <Text style={[styles.macroPillLabel, { color: grayColor }]}>{label}</Text>
    </View>
  );
}

// ─── Scanning animation — rotates through analysis steps ──────────────────
const SCAN_ANALYSIS_STEPS = [
  { icon: 'eye-outline', text: 'Identificando alimentos...' },
  { icon: 'nutrition-outline', text: 'Calculando nutrientes...' },
  { icon: 'analytics-outline', text: 'Estimando porciones...' },
  { icon: 'checkmark-circle-outline', text: 'Verificando resultados...' },
];

function ScanningAnimation({ shimmerOpacity }: { shimmerOpacity: Animated.Value }) {
  const [stepIdx, setStepIdx] = useState(0);
  const textOpacity = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulsing ring around the spinner
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(ringScale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    // Continuous spinner rotation
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();

    // Rotate through analysis steps with crossfade
    const interval = setInterval(() => {
      Animated.timing(textOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStepIdx((prev) => (prev + 1) % SCAN_ANALYSIS_STEPS.length);
        Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 2200);

    return () => {
      pulse.stop();
      spin.stop();
      clearInterval(interval);
    };
  }, []);

  const currentStep = SCAN_ANALYSIS_STEPS[stepIdx];

  return (
    <View style={scanAnimStyles.container}>
      {/* Pulsing ring */}
      <Animated.View style={[scanAnimStyles.ring, { transform: [{ scale: ringScale }] }]} />
      {/* Spinner */}
      <Animated.View
        style={[
          scanAnimStyles.spinner,
          {
            transform: [{
              rotate: spinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              }),
            }],
          },
        ]}
      />
      {/* Rotating step text */}
      <Animated.View style={[scanAnimStyles.textRow, { opacity: textOpacity }]}>
        <Ionicons name={currentStep.icon as any} size={16} color="#FFFFFF" />
        <Text style={scanAnimStyles.stepText}>{currentStep.text}</Text>
      </Animated.View>
      <Animated.Text style={[scanAnimStyles.hint, { opacity: shimmerOpacity }]}>
        Esto puede tardar hasta 10 segundos
      </Animated.Text>
    </View>
  );
}

const scanAnimStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderTopColor: 'transparent',
    marginBottom: spacing.sm,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepText: { ...typography.titleSm, color: '#FFFFFF' },
  hint: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ScanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const { isPremium } = useAuth();
  const c = useThemeColors();
  const { t } = useTranslation();
  const { track } = useAnalytics('Scan');
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResult | null>(null);
  const [todayScans, setTodayScans] = useState(0);
  const [scansLoading, setScansLoading] = useState(false);
  const [scansError, setScansError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    food_name: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fats_g: '',
  });
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale animation for result card
  const resultScale = useRef(new Animated.Value(0.92)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // Pulse animation on camera circle in idle state
  const cameraCirclePulse = usePulse({ active: scanState === 'idle', duration: 2200, maxScale: 1.06 });

  // Scanning state shimmer
  const scanShimmer = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (scanState === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanShimmer, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(scanShimmer, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [scanState]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Animate result card entrance
  useEffect(() => {
    if (scanState === 'result') {
      haptics.success();
      resultScale.setValue(0.92);
      resultOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(resultOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [scanState]);

  // Cargar conteo de escaneos al entrar y cuando volvemos a idle despues de un scan
  React.useEffect(() => {
    if (!isPremium && scanState === 'idle') {
      setScansLoading(true);
      setScansError(false);
      foodService.getFoodLogs().then((logs) => {
        // Count AI scans only (exclude manual entries) — matches server quota logic
        const aiScans = logs.filter((l) => l.ai_confidence !== null && l.ai_confidence < 1.0);
        setTodayScans(aiScans.length);
      }).catch(() => {
        setScansError(true);
        // Default to 0 so free users can still scan when offline
        setTodayScans(0);
      }).finally(() => {
        setScansLoading(false);
      });
    }
  }, [isPremium, scanState]); // solo cuando idle (carga inicial + despues de confirmar)

  const requestPermission = async (type: 'camera' | 'library') => {
    if (Platform.OS === 'web') return true;
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === 'granted';
    }
  };

  const pickImage = async (source: 'camera' | 'library') => {
    haptics.light();
    const ok = await requestPermission(source);
    if (!ok) {
      Alert.alert(
        'Permiso denegado',
        source === 'camera'
          ? 'Necesitamos acceso a la camara para escanear tu comida.'
          : 'Necesitamos acceso a la galeria para seleccionar fotos.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      exif: false,
    };

    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (res.canceled || !res.assets?.[0]) return;

    const uri = res.assets[0].uri;
    setImageUri(uri);
    await scanImage(uri);
  };

  const scanImage = async (uri: string) => {
    setScanState('scanning');
    try {
      const data = await foodService.scanFood(uri, selectedMeal);
      setResult(data);
      setIsEditing(false);
      setEditValues({
        food_name: data.food_name,
        calories: String(Math.round(data.calories)),
        protein_g: String(Math.round(data.protein_g)),
        carbs_g: String(Math.round(data.carbs_g)),
        fats_g: String(Math.round(data.fats_g)),
      });
      setScanState('result');
      track('food_scanned', {
        meal_type: selectedMeal,
        confidence: data.ai_confidence,
        food_name: data.food_name,
      });
    } catch (err: any) {
      haptics.error();
      const msg = err?.response?.data?.detail || 'No pudimos analizar la imagen. Intenta con otra foto.';
      setErrorMsg(msg);
      setScanState('error');
    }
  };

  const handleConfirm = async () => {
    haptics.medium();
    // If user edited macros, persist edits to backend before confirming
    if (isEditing && result) {
      try {
        await foodService.editFoodLog(result.id, {
          food_name: editValues.food_name,
          calories: Number(editValues.calories) || 0,
          protein_g: Number(editValues.protein_g) || 0,
          carbs_g: Number(editValues.carbs_g) || 0,
          fats_g: Number(editValues.fats_g) || 0,
        });
      } catch {
        // Best-effort save — log was already created by the backend scan
      }
    }
    track('food_logged_from_scan', {
      meal_type: selectedMeal,
      food_name: isEditing ? editValues.food_name : result?.food_name,
      calories: isEditing ? Number(editValues.calories) : result?.calories,
      was_edited: isEditing,
    });
    setScanState('logged');
    // Navigate to log after a moment
    confirmTimerRef.current = setTimeout(() => {
      setScanState('idle');
      setImageUri(null);
      setResult(null);
      setIsEditing(false);
      navigation.navigate('Registro');
    }, 2200);
  };

  const handleToggleEdit = () => {
    if (!result) return;
    haptics.light();
    if (!isEditing) {
      track('edit_macros_from_scan', { food_name: result.food_name });
      setEditValues({
        food_name: result.food_name,
        calories: String(Math.round(result.calories)),
        protein_g: String(Math.round(result.protein_g)),
        carbs_g: String(Math.round(result.carbs_g)),
        fats_g: String(Math.round(result.fats_g)),
      });
    }
    setIsEditing(!isEditing);
  };

  const handleRetry = () => {
    haptics.light();
    setScanState('idle');
    setImageUri(null);
    setResult(null);
    setIsEditing(false);
    setErrorMsg('');
  };

  const handleRetryFromError = () => {
    haptics.light();
    if (imageUri) {
      scanImage(imageUri);
    } else {
      handleRetry();
    }
  };

  // ─── Result view ────────────────────────────────────────────────────────────
  if (scanState === 'result' && result) {
    const confidence = Math.round((result.ai_confidence ?? 0) * 100);
    const displayName = isEditing ? editValues.food_name : result.food_name;
    const displayCal = isEditing ? Number(editValues.calories) || 0 : result.calories;
    const displayProtein = isEditing ? Number(editValues.protein_g) || 0 : result.protein_g;
    const displayCarbs = isEditing ? Number(editValues.carbs_g) || 0 : result.carbs_g;
    const displayFats = isEditing ? Number(editValues.fats_g) || 0 : result.fats_g;

    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Image thumbnail + food name row */}
          <View style={styles.resultTopRow}>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={styles.resultThumbnail}
                resizeMode="cover"
                accessibilityLabel="Foto del alimento escaneado"
                accessibilityRole="image"
              />
            )}
            <View style={{ flex: 1 }}>
              {isEditing ? (
                <TextInput
                  style={[styles.editNameInput, { color: c.black, borderColor: c.accent, backgroundColor: c.surface }]}
                  value={editValues.food_name}
                  onChangeText={(v) => setEditValues((p) => ({ ...p, food_name: v }))}
                  accessibilityLabel="Nombre del alimento"
                  autoFocus
                />
              ) : (
                <Text style={[styles.resultFood, { color: c.black }]}>{result.food_name}</Text>
              )}
              <Text style={[styles.resultConfidence, { color: c.gray }]}>
                {t('scan.confidence', { value: confidence })}
              </Text>
            </View>
            {result.cache_hit && (
              <View
                style={[styles.cacheBadge, { backgroundColor: c.badgeBg }]}
                accessibilityLabel="Resultado obtenido de cache"
              >
                <Ionicons name="flash" size={12} color="#F59E0B" />
                <Text style={[styles.cacheBadgeText, { color: c.badgeText }]}>Cache</Text>
              </View>
            )}
          </View>

          {/* Result card — animated scale entrance */}
          <Animated.View
            style={[
              styles.resultCard,
              { backgroundColor: c.surface, borderColor: c.grayLight, transform: [{ scale: resultScale }], opacity: resultOpacity },
            ]}
            accessibilityLabel={`Resultado: ${displayName}, ${Math.round(displayCal)} kcal`}
            accessibilityLiveRegion="polite"
          >
            {/* Main calories */}
            {isEditing ? (
              <View style={styles.editCalorieRow}>
                <TextInput
                  style={[styles.editCalorieInput, { color: c.black, borderColor: c.accent, backgroundColor: c.bg }]}
                  value={editValues.calories}
                  onChangeText={(v) => setEditValues((p) => ({ ...p, calories: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  accessibilityLabel="Calorias"
                />
                <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
              </View>
            ) : (
              <View style={styles.calorieBox}>
                <Text style={[styles.calorieValue, { color: c.black }]}>{Math.round(result.calories)}</Text>
                <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
                {result.serving_size && (
                  <Text style={[styles.servingSize, { color: c.gray }]}>por {result.serving_size}</Text>
                )}
              </View>
            )}

            {/* Macros — editable or display */}
            {isEditing ? (
              <View style={styles.macroRow}>
                {([
                  { key: 'protein_g' as const, label: 'Proteina', color: c.protein },
                  { key: 'carbs_g' as const, label: 'Carbos', color: c.carbs },
                  { key: 'fats_g' as const, label: 'Grasas', color: c.fats },
                ] as const).map((m) => (
                  <View
                    key={m.key}
                    style={[styles.macroPill, { borderColor: m.color + '40', backgroundColor: m.color + '10' }]}
                  >
                    <TextInput
                      style={[styles.editMacroInput, { color: m.color }]}
                      value={editValues[m.key]}
                      onChangeText={(v) => setEditValues((p) => ({ ...p, [m.key]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      accessibilityLabel={m.label}
                    />
                    <Text style={[styles.macroPillLabel, { color: c.gray }]}>{m.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.macroRow}>
                <MacroPill label="Proteina" value={result.protein_g}  unit="g" color={c.protein} grayColor={c.gray} />
                <MacroPill label="Carbos"   value={result.carbs_g}    unit="g" color={c.carbs}   grayColor={c.gray} />
                <MacroPill label="Grasas"   value={result.fats_g}     unit="g" color={c.fats}    grayColor={c.gray} />
              </View>
            )}

            {/* Health Score */}
            <HealthScore
              score={computeHealthScore(displayCal, displayProtein, displayCarbs, displayFats)}
              size="small"
            />

            {!isEditing && (result.fiber_g != null || result.sodium_mg != null) && (
              <View style={styles.extraRow}>
                {result.fiber_g != null && (
                  <Text style={[styles.extraItem, { color: c.gray }]}>Fibra: {result.fiber_g}g</Text>
                )}
                {result.sodium_mg != null && (
                  <Text style={[styles.extraItem, { color: c.gray }]}>Sodio: {result.sodium_mg}mg</Text>
                )}
              </View>
            )}

            {/* Meal type pill */}
            {(() => {
              const mt = MEAL_TYPES.find(m => m.value === selectedMeal)!;
              return (
                <View
                  style={[styles.mealBadge, { backgroundColor: mt.color + '15' }]}
                  accessibilityLabel={`Tipo de comida: ${t(mt.labelKey)}`}
                >
                  <Ionicons name={mt.icon as any} size={14} color={mt.color} />
                  <Text style={[styles.mealBadgeText, { color: mt.color }]}>{t(mt.labelKey)}</Text>
                </View>
              );
            })()}
          </Animated.View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: c.black }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityLabel={isEditing ? 'Guardar cambios' : 'Guardar en mi registro'}
            accessibilityRole="button"
            accessibilityHint="Confirma y guarda este alimento en tu diario"
          >
            <Ionicons name="checkmark-circle" size={20} color={c.white} />
            <Text style={[styles.confirmBtnText, { color: c.white }]}>
              {isEditing ? 'Guardar cambios' : t('scan.saveToLog')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editMacrosBtn, { backgroundColor: isEditing ? c.accent + '15' : c.surface, borderColor: c.accent + '30' }]}
            onPress={handleToggleEdit}
            activeOpacity={0.7}
            accessibilityLabel={isEditing ? 'Cancelar edicion' : 'Editar macros'}
            accessibilityRole="button"
            accessibilityHint="Corrige las calorias o macros si la IA no fue precisa"
          >
            <Ionicons name={isEditing ? 'close-outline' : 'create-outline'} size={18} color={c.accent} />
            <Text style={[styles.editMacrosBtnText, { color: c.accent }]}>
              {isEditing ? 'Cancelar edicion' : t('scan.editMacros')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.surface }]}
            onPress={handleRetry}
            activeOpacity={0.7}
            accessibilityLabel="Escanear otra foto"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={c.black} />
            <Text style={[styles.retryBtnText, { color: c.black }]}>{t('scan.scanAnother')}</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Logged confirmation — Fitsi party + confetti ────────────────────────
  if (scanState === 'logged') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg }]}
        accessibilityLabel="Comida registrada exitosamente. Redirigiendo a tu registro."
      >
        <FitsiMascot expression="party" size="large" animation="bounce" />
        <SuccessCheckmark size={64} showParticles={true} />
        <Text style={[styles.successText, { color: c.black }]}>Comida registrada!</Text>
        <Text style={[styles.successHint, { color: c.gray }]}>{t('scan.redirecting')}</Text>
      </View>
    );
  }

  // ─── Scanning loader — multi-step analysis animation ─────────────────────
  if (scanState === 'scanning') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg }]}
        accessibilityLabel="Analizando imagen con inteligencia artificial. Esto puede tardar hasta 60 segundos."
      >
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.scanningPreview}
            resizeMode="cover"
          />
        )}
        <View style={styles.scanningOverlay}>
          <ScanningAnimation shimmerOpacity={scanShimmer} />
          {/* Shimmer skeleton preview of result card */}
          <Animated.View style={[styles.shimmerCard, { opacity: scanShimmer }]}>
            <View style={styles.shimmerLine} />
            <View style={[styles.shimmerLine, { width: '60%' }]} />
            <View style={styles.shimmerMacroRow}>
              <View style={styles.shimmerPill} />
              <View style={styles.shimmerPill} />
              <View style={styles.shimmerPill} />
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── Error state — Fitsi "sick" + ErrorFallback + retry ─────────────────
  if (scanState === 'error') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}
      >
        <FitsiMascot expression="sick" size="medium" animation="sad" />
        <ErrorFallback
          message={errorMsg || 'No pudimos analizar la imagen'}
          hint="Intenta con otra foto o agrega manualmente."
          onRetry={handleRetryFromError}
          retryLabel="Reintentar"
        />
        <TouchableOpacity
          style={[styles.manualFallbackBtn, { backgroundColor: c.surface, marginTop: spacing.sm }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Registro', { screen: 'AddFood', params: { mealType: selectedMeal } });
          }}
          activeOpacity={0.7}
          accessibilityLabel="Agregar alimento manualmente"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={16} color={c.black} />
          <Text style={[styles.manualFallbackText, { color: c.black }]}>Agregar manualmente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: 'transparent', marginTop: spacing.xs }]}
          onPress={handleRetry}
          activeOpacity={0.7}
          accessibilityLabel="Volver al inicio"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back-outline" size={16} color={c.gray} />
          <Text style={[styles.retryBtnText, { color: c.gray }]}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Paywall gate — limite de escaneos gratuitos ─────────────────────────
  // Only block after the scan count has finished loading to avoid a false gate.
  if (!isPremium && !scansLoading && todayScans >= FREE_SCAN_LIMIT) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}>
        <View
          style={[styles.limitIcon, { backgroundColor: c.black }]}
          accessibilityLabel="Limite diario alcanzado"
        >
          <Ionicons name="lock-closed" size={36} color={c.white} />
        </View>
        <Text style={[styles.limitTitle, { color: c.black }]}>{t('scan.limitReached')}</Text>
        <Text style={[styles.limitSubtitle, { color: c.gray }]}>
          {t('scan.limitMessage', { limit: FREE_SCAN_LIMIT })}
        </Text>
        <TouchableOpacity
          style={[styles.upgradeBtn, { backgroundColor: c.black }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Perfil', { screen: 'Paywall' });
          }}
          activeOpacity={0.85}
          accessibilityLabel="Ver planes Premium"
          accessibilityRole="button"
          accessibilityHint="Navega a la pantalla de suscripciones Premium"
        >
          <Text style={[styles.upgradeBtnText, { color: c.white }]}>{t('scan.viewPremiumPlans')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manualFallbackBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Registro', { screen: 'AddFood', params: { mealType: selectedMeal } });
          }}
          activeOpacity={0.7}
          accessibilityLabel="Anadir alimento manualmente"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={16} color={c.black} />
          <Text style={[styles.manualFallbackText, { color: c.black }]}>{t('scan.addManually')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Idle — main scan UI ─────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}>
      {/* Header with Fitsi */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FitsiMascot expression="star" size="small" animation="wave" />
          <View>
            <Text style={[styles.title, { color: c.black }]} accessibilityRole="header">{t('scan.title')}</Text>
            <Text style={[styles.subtitle, { color: c.gray }]}>{t('scan.subtitle')}</Text>
          </View>
        </View>
      </View>

      {/* Camera viewfinder area */}
      <TouchableOpacity
        style={[styles.viewfinder, { width: contentWidth - sidePadding * 2 }]}
        onPress={() => pickImage('camera')}
        activeOpacity={0.85}
        accessibilityLabel="Abrir camara para escanear comida"
        accessibilityRole="button"
        accessibilityHint="Toma una foto de tu alimento para analizar sus nutrientes con IA"
      >
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />
        <Animated.View style={[styles.cameraCircle, cameraCirclePulse]}>
          <Ionicons name="camera" size={40} color="#FFFFFF" />
        </Animated.View>
        <Text style={styles.viewfinderText}>{t('scan.tapToOpenCamera')}</Text>
      </TouchableOpacity>

      {/* Action buttons row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface }]}
          onPress={() => pickImage('library')}
          activeOpacity={0.7}
          accessibilityLabel="Elegir foto de la galeria"
          accessibilityRole="button"
          accessibilityHint="Selecciona una foto existente de tu galeria"
        >
          <Ionicons name="images-outline" size={18} color={c.black} />
          <Text style={[styles.actionBtnText, { color: c.black }]}>{t('scan.gallery')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.barcodeBtn, { backgroundColor: c.accent + '15', borderColor: c.accent + '30' }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Barcode', { mealType: selectedMeal });
          }}
          activeOpacity={0.7}
          accessibilityLabel="Escanear codigo de barras"
          accessibilityRole="button"
          accessibilityHint="Abre el escaner de codigos de barras para buscar productos"
        >
          <Ionicons name="barcode-outline" size={18} color={c.accent} />
          <Text style={[styles.actionBtnText, { color: c.accent }]}>{t('scan.barcode')}</Text>
        </TouchableOpacity>
      </View>

      {/* Meal type selector */}
      <Text style={[styles.sectionLabel, { color: c.black }]}>{t('scan.mealType')}</Text>
      <View style={styles.mealTypes} accessibilityRole="radiogroup">
        {MEAL_TYPES.map((mt) => {
          const isSelected = selectedMeal === mt.value;
          return (
            <TouchableOpacity
              key={mt.value}
              style={[styles.mealChip, { backgroundColor: c.surface }, isSelected && { backgroundColor: c.black }]}
              onPress={() => {
                haptics.selection();
                setSelectedMeal(mt.value);
              }}
              activeOpacity={0.7}
              accessibilityLabel={t(mt.labelKey)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Ionicons name={mt.icon as any} size={15} color={isSelected ? c.white : mt.color} />
              <Text style={[styles.mealChipText, { color: c.black }, isSelected && { color: c.white }]}>
                {t(mt.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Banner plan gratuito */}
      {!isPremium && (
        scansError ? (
          // Error state — tapping retries the count fetch
          <TouchableOpacity
            style={[styles.freeBanner, { backgroundColor: c.accent + '22' }]}
            onPress={() => {
              haptics.light();
              setScansError(false);
              setScansLoading(true);
              foodService.getFoodLogs().then((logs) => {
                setTodayScans(logs.filter((l) => l.ai_confidence !== null && l.ai_confidence < 1.0).length);
              }).catch(() => setScansError(true))
                .finally(() => setScansLoading(false));
            }}
            activeOpacity={0.8}
            accessibilityLabel="Error al verificar limite de escaneos. Toca para reintentar."
            accessibilityRole="button"
          >
            <Ionicons name="wifi-outline" size={14} color={c.accent} />
            <Text style={[styles.freeBannerText, { color: c.accent }]}>
              {t('scan.scanLimitError')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.freeBanner, { backgroundColor: c.badgeBg }]}
            onPress={() => {
              haptics.light();
              navigation.navigate('Perfil', { screen: 'Paywall' });
            }}
            activeOpacity={0.8}
            accessibilityLabel={scansLoading ? 'Cargando conteo de escaneos' : `Plan gratuito: ${todayScans} de ${FREE_SCAN_LIMIT} escaneos usados hoy. Toca para ver planes Premium.`}
            accessibilityRole="button"
          >
            <Ionicons name="flash-outline" size={14} color={c.badgeText} />
            <Text style={[styles.freeBannerText, { color: c.badgeText }]}>
              {scansLoading
                ? t('scan.loadingScans')
                : t('scan.freePlan', { used: todayScans, limit: FREE_SCAN_LIMIT })}
            </Text>
            {!scansLoading && <Text style={[styles.freeBannerCta, { color: c.badgeText }]}>{t('scan.upgrade')}</Text>}
          </TouchableOpacity>
        )
      )}

      {/* Info */}
      <View style={styles.infoRow} accessibilityLabel="IA de ultima generacion. Resultados en segundos.">
        <Ionicons name="shield-checkmark-outline" size={14} color={c.gray} />
        <Text style={[styles.infoText, { color: c.gray }]}>{t('scan.aiPowered')}</Text>
      </View>
    </View>
  );
}

const CORNER = 22;
const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: spacing.md },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  title:    { ...typography.titleMd },
  subtitle: { ...typography.subtitle, textAlign: 'center' },

  // Viewfinder
  viewfinder: {
    aspectRatio: 1,
    maxHeight: 260,
    backgroundColor: '#0A0A0A',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: spacing.sm,
    alignSelf: 'center',
    minHeight: 44,
  },
  cornerTL: { position: 'absolute', top: 14, left: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerTR: { position: 'absolute', top: 14, right: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 14, left: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 14, right: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cameraCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewfinderText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },

  // Action buttons row (gallery + barcode)
  actionRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
  },
  barcodeBtn: {
    borderWidth: 1,
  },
  actionBtnText: { ...typography.label },

  // Meal chips
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  mealTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    minHeight: 44,
  },
  mealChipText: { ...typography.label },

  // Info
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg, justifyContent: 'center' },
  infoText: { ...typography.caption },

  // Scanning state
  scanningPreview: { width: '100%', height: '100%', position: 'absolute' },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  scanningText: { ...typography.titleSm, color: '#FFFFFF' },
  scanningHint: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },

  // Result
  previewImage: {
    height: 200, borderRadius: radius.xl, marginBottom: spacing.md,
  },
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
    gap: spacing.sm, ...shadows.sm,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultFood: { ...typography.titleSm, flex: 1 },
  resultConfidence: { ...typography.caption },
  cacheBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3, borderRadius: radius.full,
  },
  cacheBadgeText: { fontSize: 11, fontWeight: '700' },
  calorieBox: { alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  calorieValue: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  calorieUnit: { ...typography.label },
  servingSize: { ...typography.caption, marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  macroPill: {
    flex: 1, alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
  macroPillValue: { fontSize: 16, fontWeight: '800' },
  macroPillLabel: { ...typography.caption, marginTop: 2 },
  extraRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  extraItem: { ...typography.caption },
  mealBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start', paddingHorizontal: spacing.md,
    paddingVertical: 5, borderRadius: radius.full,
  },
  mealBadgeText: { ...typography.caption, fontWeight: '700' },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 52,
  },
  confirmBtnText: { ...typography.button },
  editMacrosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 48, borderWidth: 1,
  },
  editMacrosBtnText: { ...typography.button },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    minHeight: 48,
  },
  retryBtnText: { ...typography.button },

  // Free plan banner
  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.md, minHeight: 44,
  },
  freeBannerText: { ...typography.caption, flex: 1 },
  freeBannerCta: { ...typography.caption, fontWeight: '700' },

  // Paywall gate
  limitIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  limitTitle: { ...typography.titleSm, marginBottom: spacing.sm },
  limitSubtitle: { ...typography.subtitle, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  upgradeBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginBottom: spacing.sm, width: '100%', alignItems: 'center',
    minHeight: 52,
  },
  upgradeBtnText: { ...typography.button },
  manualFallbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    width: '100%', justifyContent: 'center', minHeight: 48,
  },
  manualFallbackText: { ...typography.label },

  // Shimmer skeleton
  shimmerCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    gap: 12,
    marginTop: spacing.md,
  },
  shimmerLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: '85%',
  },
  shimmerMacroRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  shimmerPill: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // Success
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successText: { ...typography.titleMd },
  successHint: { ...typography.caption, marginTop: spacing.xs },
});
