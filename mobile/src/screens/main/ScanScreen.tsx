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
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import * as foodService from '../../services/food.service';
import { FoodScanResult } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { haptics } from '../../hooks/useHaptics';

const FREE_SCAN_LIMIT = 3;

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ScanState = 'idle' | 'scanning' | 'result' | 'logged';

const MEAL_TYPES: { value: MealType; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'Desayuno', icon: 'sunny-outline',      color: '#F59E0B' },
  { value: 'lunch',     label: 'Almuerzo', icon: 'restaurant-outline',  color: '#10B981' },
  { value: 'dinner',    label: 'Cena',     icon: 'moon-outline',        color: '#6366F1' },
  { value: 'snack',     label: 'Snack',    icon: 'cafe-outline',        color: '#EC4899' },
];

// ─── Macro pill ───────────────────────────────────────────────────────────────
function MacroPill({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View
      style={[styles.macroPill, { borderColor: color + '40', backgroundColor: color + '10' }]}
      accessibilityLabel={`${label}: ${Math.round(value)} ${unit}`}
    >
      <Text style={[styles.macroPillValue, { color }]}>{Math.round(value)}{unit}</Text>
      <Text style={styles.macroPillLabel}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ScanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const { isPremium } = useAuth();
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResult | null>(null);
  const [todayScans, setTodayScans] = useState(0);
  const [scansLoading, setScansLoading] = useState(false);
  const [scansError, setScansError] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale animation for result card
  const resultScale = useRef(new Animated.Value(0.92)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // Success checkmark animation
  const successScale = useRef(new Animated.Value(0)).current;

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

  // Animate success checkmark
  useEffect(() => {
    if (scanState === 'logged') {
      haptics.success();
      successScale.setValue(0);
      Animated.spring(successScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [scanState]);

  // Cargar conteo de escaneos al entrar y cuando volvemos a idle despues de un scan
  React.useEffect(() => {
    if (!isPremium && scanState === 'idle') {
      setScansLoading(true);
      setScansError(false);
      foodService.getFoodLogs().then((logs) => {
        // Contar solo los que tienen imagen (scan IA), no manuales
        const aiScans = logs.filter((l) => l.image_url);
        setTodayScans(aiScans.length);
      }).catch(() => {
        setScansError(true);
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
      quality: 0.85,
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
      setScanState('result');
    } catch (err: any) {
      setScanState('idle');
      haptics.error();
      const msg = err?.response?.data?.detail || 'No pudimos analizar la imagen.';
      Alert.alert(
        'Error al escanear',
        msg,
        [
          { text: 'Reintentar', onPress: () => scanImage(uri) },
          {
            text: 'Anadir manualmente',
            onPress: () => navigation.navigate('Registro', {
              screen: 'AddFood',
              params: { mealType: selectedMeal },
            }),
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    }
  };

  const handleConfirm = () => {
    haptics.medium();
    setScanState('logged');
    // Navigate to log after a moment
    confirmTimerRef.current = setTimeout(() => {
      setScanState('idle');
      setImageUri(null);
      setResult(null);
      navigation.navigate('Registro');
    }, 1800);
  };

  const handleRetry = () => {
    haptics.light();
    setScanState('idle');
    setImageUri(null);
    setResult(null);
  };

  // ─── Result view ────────────────────────────────────────────────────────────
  if (scanState === 'result' && result) {
    const confidence = Math.round((result.ai_confidence ?? 0) * 100);
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        >
          {/* Image preview */}
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={[styles.previewImage, { width: contentWidth - sidePadding * 2 }]}
              resizeMode="cover"
              accessibilityLabel="Foto del alimento escaneado"
              accessibilityRole="image"
            />
          )}

          {/* Result card — animated scale entrance */}
          <Animated.View
            style={[
              styles.resultCard,
              { transform: [{ scale: resultScale }], opacity: resultOpacity },
            ]}
            accessibilityLabel={`Resultado del escaneo: ${result.food_name}, ${Math.round(result.calories)} kilocalorías, confianza ${confidence} por ciento`}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultFood}>{result.food_name}</Text>
              {result.cache_hit && (
                <View
                  style={styles.cacheBadge}
                  accessibilityLabel="Resultado obtenido de cache"
                >
                  <Ionicons name="flash" size={12} color="#F59E0B" />
                  <Text style={styles.cacheBadgeText}>Cache</Text>
                </View>
              )}
            </View>
            <Text style={styles.resultConfidence}>
              Confianza IA: {confidence}%
            </Text>

            {/* Main calories */}
            <View style={styles.calorieBox}>
              <Text style={styles.calorieValue}>{Math.round(result.calories)}</Text>
              <Text style={styles.calorieUnit}>kcal</Text>
              {result.serving_size && (
                <Text style={styles.servingSize}>por {result.serving_size}</Text>
              )}
            </View>

            {/* Macros */}
            <View style={styles.macroRow}>
              <MacroPill label="Proteina" value={result.protein_g}  unit="g" color={colors.protein} />
              <MacroPill label="Carbos"   value={result.carbs_g}    unit="g" color={colors.carbs}   />
              <MacroPill label="Grasas"   value={result.fats_g}     unit="g" color={colors.fats}    />
            </View>

            {(result.fiber_g != null || result.sodium_mg != null) && (
              <View style={styles.extraRow}>
                {result.fiber_g != null && (
                  <Text style={styles.extraItem}>Fibra: {result.fiber_g}g</Text>
                )}
                {result.sodium_mg != null && (
                  <Text style={styles.extraItem}>Sodio: {result.sodium_mg}mg</Text>
                )}
              </View>
            )}

            {/* Meal type pill */}
            {(() => {
              const mt = MEAL_TYPES.find(m => m.value === selectedMeal)!;
              return (
                <View
                  style={[styles.mealBadge, { backgroundColor: mt.color + '15' }]}
                  accessibilityLabel={`Tipo de comida: ${mt.label}`}
                >
                  <Ionicons name={mt.icon as any} size={14} color={mt.color} />
                  <Text style={[styles.mealBadgeText, { color: mt.color }]}>{mt.label}</Text>
                </View>
              );
            })()}
          </Animated.View>

          {/* Actions */}
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityLabel="Guardar en mi registro"
            accessibilityRole="button"
            accessibilityHint="Confirma y guarda este alimento en tu diario"
          >
            <Ionicons name="checkmark-circle" size={20} color={colors.white} />
            <Text style={styles.confirmBtnText}>Guardar en mi registro</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            activeOpacity={0.7}
            accessibilityLabel="Escanear otra foto"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.black} />
            <Text style={styles.retryBtnText}>Escanear otra foto</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Logged confirmation ─────────────────────────────────────────────────
  if (scanState === 'logged') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top }]}
        accessibilityLabel="Alimento registrado exitosamente. Redirigiendo a tu registro."
      >
        <Animated.View style={[styles.successIcon, { transform: [{ scale: successScale }] }]}>
          <Ionicons name="checkmark" size={44} color={colors.white} />
        </Animated.View>
        <Text style={styles.successText}>Registrado!</Text>
        <Text style={styles.successHint}>Redirigiendo a tu registro...</Text>
      </View>
    );
  }

  // ─── Scanning loader ─────────────────────────────────────────────────────
  if (scanState === 'scanning') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top }]}
        accessibilityLabel="Analizando imagen con inteligencia artificial. Esto puede tardar hasta 10 segundos."
      >
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.scanningPreview}
            resizeMode="cover"
          />
        )}
        <View style={styles.scanningOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.scanningText}>Analizando con IA...</Text>
          <Text style={styles.scanningHint}>Esto puede tardar hasta 10 segundos</Text>
        </View>
      </View>
    );
  }

  // ─── Paywall gate — limite de escaneos gratuitos ─────────────────────────
  // Only block after the scan count has finished loading to avoid a false gate.
  if (!isPremium && !scansLoading && todayScans >= FREE_SCAN_LIMIT) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding }]}>
        <View
          style={styles.limitIcon}
          accessibilityLabel="Limite diario alcanzado"
        >
          <Ionicons name="lock-closed" size={36} color={colors.white} />
        </View>
        <Text style={styles.limitTitle}>Limite diario alcanzado</Text>
        <Text style={styles.limitSubtitle}>
          Has usado tus {FREE_SCAN_LIMIT} escaneos gratuitos de hoy.{'\n'}
          Hazte Premium para escaneos ilimitados.
        </Text>
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => {
            haptics.light();
            navigation.navigate('Perfil', { screen: 'Paywall' });
          }}
          activeOpacity={0.85}
          accessibilityLabel="Ver planes Premium"
          accessibilityRole="button"
          accessibilityHint="Navega a la pantalla de suscripciones Premium"
        >
          <Text style={styles.upgradeBtnText}>Ver planes Premium</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manualFallbackBtn}
          onPress={() => {
            haptics.light();
            navigation.navigate('Registro', { screen: 'AddFood', params: { mealType: selectedMeal } });
          }}
          activeOpacity={0.7}
          accessibilityLabel="Anadir alimento manualmente"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={16} color={colors.black} />
          <Text style={styles.manualFallbackText}>Anadir manualmente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Idle — main scan UI ─────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingHorizontal: sidePadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Escanear comida</Text>
        <Text style={styles.subtitle}>La IA detecta nutrientes automaticamente</Text>
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
        <View style={styles.cameraCircle}>
          <Ionicons name="camera" size={40} color={colors.white} />
        </View>
        <Text style={styles.viewfinderText}>Toca para abrir camara</Text>
      </TouchableOpacity>

      {/* Gallery button */}
      <TouchableOpacity
        style={styles.galleryBtn}
        onPress={() => pickImage('library')}
        activeOpacity={0.7}
        accessibilityLabel="Elegir foto de la galeria"
        accessibilityRole="button"
        accessibilityHint="Selecciona una foto existente de tu galeria"
      >
        <Ionicons name="images-outline" size={18} color={colors.black} />
        <Text style={styles.galleryBtnText}>Elegir de galeria</Text>
      </TouchableOpacity>

      {/* Meal type selector */}
      <Text style={styles.sectionLabel}>Tipo de comida</Text>
      <View style={styles.mealTypes} accessibilityRole="radiogroup">
        {MEAL_TYPES.map((mt) => {
          const isSelected = selectedMeal === mt.value;
          return (
            <TouchableOpacity
              key={mt.value}
              style={[styles.mealChip, isSelected && styles.mealChipActive]}
              onPress={() => {
                haptics.selection();
                setSelectedMeal(mt.value);
              }}
              activeOpacity={0.7}
              accessibilityLabel={mt.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Ionicons name={mt.icon as any} size={15} color={isSelected ? colors.white : mt.color} />
              <Text style={[styles.mealChipText, isSelected && styles.mealChipTextActive]}>
                {mt.label}
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
            style={[styles.freeBanner, { backgroundColor: colors.accent + '22' }]}
            onPress={() => {
              haptics.light();
              setScansError(false);
              setScansLoading(true);
              foodService.getFoodLogs().then((logs) => {
                setTodayScans(logs.filter((l) => l.image_url).length);
              }).catch(() => setScansError(true))
                .finally(() => setScansLoading(false));
            }}
            activeOpacity={0.8}
            accessibilityLabel="Error al verificar limite de escaneos. Toca para reintentar."
            accessibilityRole="button"
          >
            <Ionicons name="wifi-outline" size={14} color={colors.accent} />
            <Text style={[styles.freeBannerText, { color: colors.accent }]}>
              No se pudo verificar el limite. Toca para reintentar.
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.freeBanner}
            onPress={() => {
              haptics.light();
              navigation.navigate('Perfil', { screen: 'Paywall' });
            }}
            activeOpacity={0.8}
            accessibilityLabel={scansLoading ? 'Cargando conteo de escaneos' : `Plan gratuito: ${todayScans} de ${FREE_SCAN_LIMIT} escaneos usados hoy. Toca para ver planes Premium.`}
            accessibilityRole="button"
          >
            <Ionicons name="flash-outline" size={14} color={colors.badgeText} />
            <Text style={styles.freeBannerText}>
              {scansLoading
                ? 'Cargando escaneos...'
                : `Plan gratuito: ${todayScans}/${FREE_SCAN_LIMIT} escaneos usados hoy`}
            </Text>
            {!scansLoading && <Text style={styles.freeBannerCta}>Mejorar</Text>}
          </TouchableOpacity>
        )
      )}

      {/* Info */}
      <View style={styles.infoRow} accessibilityLabel="IA de ultima generacion. Resultados en segundos.">
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.gray} />
        <Text style={styles.infoText}>IA de ultima generacion -- Resultados en segundos</Text>
      </View>
    </View>
  );
}

const CORNER = 22;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: spacing.md },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  title:    { ...typography.titleMd, color: colors.black },
  subtitle: { ...typography.subtitle, color: colors.gray, textAlign: 'center' },

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
  cornerTL: { position: 'absolute', top: 14, left: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.white, borderRadius: 4 },
  cornerTR: { position: 'absolute', top: 14, right: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderRightWidth: 3, borderColor: colors.white, borderRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 14, left: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: colors.white, borderRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 14, right: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderRightWidth: 3, borderColor: colors.white, borderRadius: 4 },
  cameraCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewfinderText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },

  // Gallery
  galleryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  galleryBtnText: { ...typography.label, color: colors.black },

  // Meal chips
  sectionLabel: { ...typography.label, color: colors.black, marginTop: spacing.lg, marginBottom: spacing.sm },
  mealTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    minHeight: 44,
  },
  mealChipActive: { backgroundColor: colors.black },
  mealChipText: { ...typography.label, color: colors.black },
  mealChipTextActive: { color: colors.white },

  // Info
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg, justifyContent: 'center' },
  infoText: { ...typography.caption, color: colors.gray },

  // Scanning state
  scanningPreview: { width: '100%', height: '100%', position: 'absolute' },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  scanningText: { ...typography.titleSm, color: colors.white },
  scanningHint: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },

  // Result
  previewImage: {
    height: 200, borderRadius: radius.xl, marginBottom: spacing.md,
  },
  resultCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.grayLight,
    padding: spacing.md, marginBottom: spacing.md,
    gap: spacing.sm, ...shadows.sm,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultFood: { ...typography.titleSm, color: colors.black, flex: 1 },
  resultConfidence: { ...typography.caption, color: colors.gray },
  cacheBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.badgeBg, paddingHorizontal: spacing.sm,
    paddingVertical: 3, borderRadius: radius.full,
  },
  cacheBadgeText: { fontSize: 11, fontWeight: '700', color: colors.badgeText },
  calorieBox: { alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  calorieValue: { fontSize: 52, fontWeight: '800', color: colors.black, letterSpacing: -2 },
  calorieUnit: { ...typography.label, color: colors.gray },
  servingSize: { ...typography.caption, color: colors.gray, marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  macroPill: {
    flex: 1, alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
  macroPillValue: { fontSize: 16, fontWeight: '800' },
  macroPillLabel: { ...typography.caption, color: colors.gray, marginTop: 2 },
  extraRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  extraItem: { ...typography.caption, color: colors.gray },
  mealBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start', paddingHorizontal: spacing.md,
    paddingVertical: 5, borderRadius: radius.full,
  },
  mealBadgeText: { ...typography.caption, fontWeight: '700' },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.black,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 52,
  },
  confirmBtnText: { ...typography.button, color: colors.white },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.surface,
    paddingVertical: spacing.md, borderRadius: radius.full,
    minHeight: 48,
  },
  retryBtnText: { ...typography.button, color: colors.black },

  // Free plan banner
  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.badgeBg, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.md, minHeight: 44,
  },
  freeBannerText: { ...typography.caption, color: colors.badgeText, flex: 1 },
  freeBannerCta: { ...typography.caption, fontWeight: '700', color: colors.badgeText },

  // Paywall gate
  limitIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  limitTitle: { ...typography.titleSm, color: colors.black, marginBottom: spacing.sm },
  limitSubtitle: { ...typography.subtitle, color: colors.gray, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  upgradeBtn: {
    backgroundColor: colors.black, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginBottom: spacing.sm, width: '100%', alignItems: 'center',
    minHeight: 52,
  },
  upgradeBtnText: { ...typography.button, color: colors.white },
  manualFallbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    width: '100%', justifyContent: 'center', minHeight: 48,
  },
  manualFallbackText: { ...typography.label, color: colors.black },

  // Success
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successText: { ...typography.titleMd, color: colors.black },
  successHint: { ...typography.caption, color: colors.gray, marginTop: spacing.xs },
});
