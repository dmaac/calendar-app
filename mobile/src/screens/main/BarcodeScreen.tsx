/**
 * BarcodeScreen — Scan food product barcodes (EAN-13, UPC-A)
 * Uses expo-camera barcodeScannerSettings for detection.
 * Looks up nutrition data on Open Food Facts, lets the user pick servings, and logs to diary.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { lookupBarcode, BarcodeProduct } from '../../services/barcode.service';
import * as foodService from '../../services/food.service';
import SuccessCheckmark from '../../components/SuccessCheckmark';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: { value: MealType; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'Desayuno', icon: 'sunny-outline',     color: '#F59E0B' },
  { value: 'lunch',     label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { value: 'dinner',    label: 'Cena',     icon: 'moon-outline',       color: '#6366F1' },
  { value: 'snack',     label: 'Snack',    icon: 'cafe-outline',       color: '#EC4899' },
];

const SERVING_OPTIONS = [0.5, 1, 1.5, 2];

type ScreenState = 'scanning' | 'loading' | 'result' | 'not_found' | 'logged';

function MacroPill({ label, value, unit, color, colors }: { label: string; value: number; unit: string; color: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      style={[styles.macroPill, { borderColor: color + '40', backgroundColor: color + '10' }]}
      accessibilityLabel={`${label}: ${Math.round(value)} ${unit}`}
    >
      <Text style={[styles.macroPillValue, { color }]}>{Math.round(value)}{unit}</Text>
      <Text style={[styles.macroPillLabel, { color: colors.gray }]}>{label}</Text>
    </View>
  );
}

export default function BarcodeScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Barcode');
  const [permission, requestPermission] = useCameraPermissions();

  const [state, setState] = useState<ScreenState>('scanning');
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [servings, setServings] = useState(1);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(route?.params?.mealType ?? 'lunch');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Result card animation
  const resultScale = useRef(new Animated.Value(0.92)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // Scanning line animation
  const scanLineY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineY, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(scanLineY, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [state]);

  useEffect(() => {
    if (state === 'result') {
      haptics.success();
      resultScale.setValue(0.92);
      resultOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (state !== 'scanning' || scannedCode === data) return;
    setScannedCode(data);
    setState('loading');
    haptics.medium();

    try {
      const result = await lookupBarcode(data);
      if (result) {
        setProduct(result);
        setState('result');
        track('barcode_scanned', { barcode: data, product_name: result.name });
      } else {
        setState('not_found');
      }
    } catch {
      setState('not_found');
    }
  };

  const handleLogFood = async () => {
    if (!product || logging) return;
    setLogging(true);
    haptics.medium();

    try {
      await foodService.manualLogFood({
        food_name: product.brand ? `${product.name} (${product.brand})` : product.name,
        calories: Math.round(product.calories * servings),
        carbs_g: Math.round(product.carbs_g * servings * 10) / 10,
        protein_g: Math.round(product.protein_g * servings * 10) / 10,
        fats_g: Math.round(product.fat_g * servings * 10) / 10,
        fiber_g: product.fiber_g != null ? Math.round(product.fiber_g * servings * 10) / 10 : undefined,
        serving_size: product.serving_size ?? '100g',
        meal_type: selectedMeal,
      });
      setState('logged');
      track('barcode_food_logged', {
        product_name: product.name,
        meal_type: selectedMeal,
        servings,
        calories: Math.round(product.calories * servings),
      });
      confirmTimerRef.current = setTimeout(() => {
        navigation.navigate('Registro');
      }, 1800);
    } catch {
      haptics.error();
      Alert.alert('Error', 'No se pudo registrar el alimento. Intenta de nuevo.');
    } finally {
      setLogging(false);
    }
  };

  const handleRetry = () => {
    haptics.light();
    setScannedCode(null);
    setProduct(null);
    setServings(1);
    setState('scanning');
  };

  const handleManualEntry = () => {
    haptics.light();
    navigation.navigate('Registro', {
      screen: 'AddFood',
      params: { mealType: selectedMeal },
    });
  };

  // ─── Permission not granted ────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.black} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}>
        <View style={[styles.permIcon, { backgroundColor: c.black }]}>
          <Ionicons name="camera-outline" size={36} color={c.white} />
        </View>
        <Text style={[styles.permTitle, { color: c.black }]}>Acceso a camara</Text>
        <Text style={[styles.permSubtitle, { color: c.gray }]}>
          Necesitamos acceso a la camara para escanear codigos de barras.
        </Text>
        <TouchableOpacity
          style={[styles.permBtn, { backgroundColor: c.black }]}
          onPress={requestPermission}
          activeOpacity={0.85}
          accessibilityLabel="Permitir acceso a la camara"
          accessibilityRole="button"
        >
          <Text style={[styles.permBtnText, { color: c.white }]}>Permitir camara</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backBtnAlt}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Text style={[styles.backBtnAltText, { color: c.gray }]}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Logged confirmation ───────────────────────────────────────────────────
  if (state === 'logged') {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg }]}
        accessibilityLabel="Alimento registrado exitosamente. Redirigiendo a tu registro."
      >
        <SuccessCheckmark size={88} showParticles={true} />
        <Text style={[styles.successText, { color: c.black }]}>Registrado!</Text>
        <Text style={[styles.successHint, { color: c.gray }]}>Redirigiendo a tu registro...</Text>
      </View>
    );
  }

  // ─── Not found ─────────────────────────────────────────────────────────────
  if (state === 'not_found') {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}>
        <View style={[styles.notFoundIcon, { backgroundColor: c.accent }]}>
          <Ionicons name="search-outline" size={36} color={c.white} />
        </View>
        <Text style={[styles.notFoundTitle, { color: c.black }]}>Producto no encontrado</Text>
        <Text style={[styles.notFoundSubtitle, { color: c.gray }]}>
          No encontramos este codigo en nuestra base de datos.{'\n'}
          Puedes anadirlo manualmente.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: c.black }]}
          onPress={handleManualEntry}
          activeOpacity={0.85}
          accessibilityLabel="Anadir manualmente"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={18} color={c.white} />
          <Text style={[styles.primaryBtnText, { color: c.white }]}>Anadir manualmente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: c.surface }]}
          onPress={handleRetry}
          activeOpacity={0.7}
          accessibilityLabel="Escanear de nuevo"
          accessibilityRole="button"
        >
          <Ionicons name="barcode-outline" size={18} color={c.black} />
          <Text style={[styles.secondaryBtnText, { color: c.black }]}>Escanear de nuevo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Result view ───────────────────────────────────────────────────────────
  if (state === 'result' && product) {
    const cal = Math.round(product.calories * servings);
    const pro = Math.round(product.protein_g * servings * 10) / 10;
    const carb = Math.round(product.carbs_g * servings * 10) / 10;
    const fat = Math.round(product.fat_g * servings * 10) / 10;

    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        {/* Back button */}
        <TouchableOpacity
          style={[styles.backBtn, { left: sidePadding, backgroundColor: c.surface }]}
          onPress={handleRetry}
          activeOpacity={0.7}
          accessibilityLabel="Volver a escanear"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        >
          {/* Product image */}
          {product.image_url && (
            <Image
              source={{ uri: product.image_url }}
              style={[styles.productImage, { width: contentWidth - sidePadding * 2, backgroundColor: c.surface }]}
              resizeMode="contain"
              accessibilityLabel={`Imagen de ${product.name}`}
            />
          )}

          {/* Result card */}
          <Animated.View
            style={[styles.resultCard, { backgroundColor: c.bg, borderColor: c.grayLight, transform: [{ scale: resultScale }], opacity: resultOpacity }]}
          >
            <Text style={[styles.resultName, { color: c.black }]}>{product.name}</Text>
            {product.brand ? <Text style={[styles.resultBrand, { color: c.gray }]}>{product.brand}</Text> : null}

            {/* Calories */}
            <View style={styles.calorieBox}>
              <Text style={[styles.calorieValue, { color: c.black }]}>{cal}</Text>
              <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
              <Text style={[styles.servingInfo, { color: c.gray }]}>
                por {servings === 1 ? '100g' : `${Math.round(servings * 100)}g`}
                {product.serving_size ? ` (porcion: ${product.serving_size})` : ''}
              </Text>
            </View>

            {/* Macros */}
            <View style={styles.macroRow}>
              <MacroPill label="Proteina" value={pro}  unit="g" color={c.protein} colors={c} />
              <MacroPill label="Carbos"   value={carb} unit="g" color={c.carbs}   colors={c} />
              <MacroPill label="Grasas"   value={fat}  unit="g" color={c.fats}    colors={c} />
            </View>

            {product.fiber_g != null && (
              <Text style={[styles.extraItem, { color: c.gray }]}>
                Fibra: {Math.round(product.fiber_g * servings * 10) / 10}g
              </Text>
            )}
          </Animated.View>

          {/* Serving selector */}
          <Text style={[styles.sectionLabel, { color: c.black }]}>Porciones (x 100g)</Text>
          <View style={styles.servingRow}>
            {SERVING_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.servingChip, { backgroundColor: c.surface }, servings === s && { backgroundColor: c.black }]}
                onPress={() => {
                  haptics.selection();
                  setServings(s);
                }}
                activeOpacity={0.7}
                accessibilityLabel={`${s} porcion${s !== 1 ? 'es' : ''}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: servings === s }}
              >
                <Text style={[styles.servingChipText, { color: c.black }, servings === s && { color: c.white }]}>
                  {s}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Meal type selector */}
          <Text style={[styles.sectionLabel, { color: c.black }]}>Tipo de comida</Text>
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
                  accessibilityLabel={mt.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Ionicons name={mt.icon as any} size={15} color={isSelected ? c.white : mt.color} />
                  <Text style={[styles.mealChipText, { color: c.black }, isSelected && { color: c.white }]}>
                    {mt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Log button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: spacing.lg, backgroundColor: c.black }]}
            onPress={handleLogFood}
            activeOpacity={0.85}
            disabled={logging}
            accessibilityLabel="Guardar en mi registro"
            accessibilityRole="button"
          >
            {logging ? (
              <ActivityIndicator size="small" color={c.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={c.white} />
                <Text style={[styles.primaryBtnText, { color: c.white }]}>Guardar en mi registro</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: c.surface }]}
            onPress={handleRetry}
            activeOpacity={0.7}
            accessibilityLabel="Escanear otro producto"
            accessibilityRole="button"
          >
            <Ionicons name="barcode-outline" size={18} color={c.black} />
            <Text style={[styles.secondaryBtnText, { color: c.black }]}>Escanear otro</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.black} />
        <Text style={[styles.loadingText, { color: c.gray }]}>Buscando producto...</Text>
      </View>
    );
  }

  // ─── Camera / Scanning ─────────────────────────────────────────────────────
  const scanLineTranslate = scanLineY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerBackBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Escanear codigo</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Camera viewfinder */}
      <View style={[styles.cameraContainer, { width: contentWidth - sidePadding * 2 }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={state === 'scanning' ? handleBarCodeScanned : undefined}
        />
        {/* Overlay with cutout */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
            <Animated.View
              style={[
                styles.scanLine,
                { backgroundColor: c.accent, transform: [{ translateY: scanLineTranslate }] },
              ]}
            />
          </View>
        </View>
      </View>

      <Text style={[styles.hint, { color: c.gray }]}>Apunta la camara al codigo de barras del producto</Text>

      {/* Manual entry fallback */}
      <TouchableOpacity
        style={[styles.secondaryBtn, { marginHorizontal: sidePadding, marginTop: spacing.md, backgroundColor: c.surface }]}
        onPress={handleManualEntry}
        activeOpacity={0.7}
        accessibilityLabel="Anadir manualmente"
        accessibilityRole="button"
      >
        <Ionicons name="create-outline" size={18} color={c.black} />
        <Text style={[styles.secondaryBtnText, { color: c.black }]}>Anadir manualmente</Text>
      </TouchableOpacity>
    </View>
  );
}

const CORNER = 22;
const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: spacing.xl + spacing.lg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },

  // Camera
  cameraContainer: {
    aspectRatio: 3 / 4,
    maxHeight: 340,
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240, height: 200,
    backgroundColor: 'transparent',
  },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: CORNER, height: CORNER, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: CORNER, height: CORNER, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: CORNER, height: CORNER, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: CORNER, height: CORNER, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  scanLine: {
    position: 'absolute',
    left: 8, right: 8, height: 2,
    borderRadius: 1,
  },

  hint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // Back button (result view)
  backBtn: {
    position: 'absolute', top: spacing.md, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  // Product image
  productImage: {
    height: 160, borderRadius: radius.xl, marginBottom: spacing.md,
  },

  // Result card
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
    gap: spacing.sm, ...shadows.sm,
  },
  resultName: { ...typography.titleSm },
  resultBrand: { ...typography.caption },
  calorieBox: { alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  calorieValue: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  calorieUnit: { ...typography.label },
  servingInfo: { ...typography.caption, marginTop: 2, textAlign: 'center' },
  macroRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  macroPill: {
    flex: 1, alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
  macroPillValue: { fontSize: 16, fontWeight: '800' },
  macroPillLabel: { ...typography.caption, marginTop: 2 },
  extraItem: { ...typography.caption, textAlign: 'center' },

  // Serving selector
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  servingRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  servingChip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  servingChipText: { ...typography.label },

  // Meal chips
  mealTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    minHeight: 44,
  },
  mealChipText: { ...typography.label },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 52,
  },
  primaryBtnText: { ...typography.button },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    minHeight: 48,
  },
  secondaryBtnText: { ...typography.button },

  // Loading
  loadingText: { ...typography.subtitle, marginTop: spacing.md },

  // Permission
  permIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  permTitle: { ...typography.titleSm, marginBottom: spacing.sm },
  permSubtitle: { ...typography.subtitle, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  permBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginBottom: spacing.sm, width: '100%', alignItems: 'center', minHeight: 52,
  },
  permBtnText: { ...typography.button },
  backBtnAlt: {
    paddingVertical: spacing.md, width: '100%', alignItems: 'center', minHeight: 48,
  },
  backBtnAltText: { ...typography.button },

  // Not found
  notFoundIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  notFoundTitle: { ...typography.titleSm, marginBottom: spacing.sm },
  notFoundSubtitle: {
    ...typography.subtitle, textAlign: 'center',
    lineHeight: 22, marginBottom: spacing.xl,
  },

  // Success
  successText: { ...typography.titleMd },
  successHint: { ...typography.caption, marginTop: spacing.xs },
});
