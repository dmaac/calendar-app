/**
 * LogScreen — Diario de alimentos del día
 * Comidas agrupadas por tipo · Eliminar · Añadir manualmente · Tracking de agua
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { MealType } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import WaterTracker from '../../components/WaterTracker';
import FitsiMascot from '../../components/FitsiMascot';
import ConfettiEffect from '../../components/ConfettiEffect';
import BottomSheet from '../../components/BottomSheet';
import { showNotification } from '../../components/InAppNotification';

const MEAL_META = mealColors;
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_SUMMARY: DailySummary = {
  date: new Date().toISOString().split('T')[0],
  total_calories: 1240, total_protein_g: 82, total_carbs_g: 130, total_fats_g: 38,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 1500, meals_logged: 3, streak_days: 4,
};

const MOCK_LOGS: AIFoodLog[] = [
  { id: -1, logged_at: new Date().toISOString(), meal_type: 'breakfast', food_name: 'Avena con frutas', calories: 320, carbs_g: 52, protein_g: 12, fats_g: 8, fiber_g: 5, image_url: null, ai_confidence: 0.95, was_edited: false },
  { id: -2, logged_at: new Date().toISOString(), meal_type: 'lunch', food_name: 'Pollo a la plancha con arroz', calories: 520, carbs_g: 48, protein_g: 42, fats_g: 14, fiber_g: 3, image_url: null, ai_confidence: 0.92, was_edited: false },
  { id: -3, logged_at: new Date().toISOString(), meal_type: 'snack', food_name: 'Yogurt griego con miel', calories: 180, carbs_g: 18, protein_g: 16, fats_g: 6, fiber_g: 0, image_url: null, ai_confidence: 0.88, was_edited: false },
  { id: -4, logged_at: new Date().toISOString(), meal_type: 'dinner', food_name: 'Salmon con verduras', calories: 420, carbs_g: 12, protein_g: 35, fats_g: 22, fiber_g: 6, image_url: null, ai_confidence: 0.91, was_edited: false },
];

// ─── Add options bottom sheet (memoized to skip re-render when log list changes)
const AddSheet = React.memo(function AddSheet({
  visible,
  mealType,
  onClose,
  onScan,
  onManual,
  onSearch,
}: {
  visible: boolean;
  mealType: MealType | null;
  onClose: () => void;
  onScan: () => void;
  onManual: () => void;
  onSearch: () => void;
}) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[sheetStyles.title, { color: c.gray }]}>
        Anadir a {mealType ? MEAL_META[mealType]?.label : 'comida'}
      </Text>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onScan}
        activeOpacity={0.7}
        accessibilityLabel="Escanear con IA. Saca una foto a tu comida"
        accessibilityRole="button"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.black }]}>
          <Ionicons name="camera" size={20} color={c.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Escanear con IA</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Saca una foto a tu comida</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onSearch}
        activeOpacity={0.7}
        accessibilityLabel="Buscar alimento en la base de datos"
        accessibilityRole="button"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="search" size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Buscar alimento</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Busca en nuestra base de datos</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onManual}
        activeOpacity={0.7}
        accessibilityLabel="Anadir manualmente. Escribe el nombre y macros"
        accessibilityRole="button"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.surface }]}>
          <Ionicons name="create-outline" size={20} color={c.black} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Anadir manualmente</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Escribe el nombre y macros</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
    </BottomSheet>
  );
});

const sheetStyles = StyleSheet.create({
  title: { ...typography.label, textAlign: 'center', marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optLabel: { ...typography.bodyMd },
  optSub: { ...typography.caption, marginTop: 2 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Log');
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [waterMl, setWaterMl] = useState(0);
  const [modalMeal, setModalMeal] = useState<MealType | null>(null);
  const [error, setError] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const prevLogCount = useRef(0);

  const load = async () => {
    setError(false);
    try {
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(),
        foodService.getDailySummary(),
      ]);

      const logsOk = l.status === 'fulfilled';
      const summaryOk = s.status === 'fulfilled';

      if (logsOk) setLogs(l.value);
      if (summaryOk) {
        setSummary(s.value);
        setWaterMl(s.value.water_ml ?? 0);
      }

      // Fall back to mock data when API is unavailable
      if (!logsOk && !summaryOk) {
        setError(true);
        setLogs(MOCK_LOGS);
        setSummary(MOCK_SUMMARY);
        setWaterMl(MOCK_SUMMARY.water_ml);
      } else if (!logsOk) {
        setError(true);
        setLogs(MOCK_LOGS);
      } else if (!summaryOk) {
        setError(true);
        setSummary(MOCK_SUMMARY);
        setWaterMl(MOCK_SUMMARY.water_ml);
      }
    } catch {
      setError(true);
      setLogs(MOCK_LOGS);
      setSummary(MOCK_SUMMARY);
      setWaterMl(MOCK_SUMMARY.water_ml);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  // Detect when a new food log is added (logs count increased) and fire confetti
  useEffect(() => {
    if (logs.length > prevLogCount.current && prevLogCount.current > 0) {
      setConfettiTrigger(true);
      showNotification({ message: 'Comida registrada!', type: 'success', icon: 'checkmark-circle' });
      haptics.success();
      // Reset trigger after a tick so it can fire again
      const timer = setTimeout(() => setConfettiTrigger(false), 100);
      return () => clearTimeout(timer);
    }
    prevLogCount.current = logs.length;
  }, [logs.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Stable callback refs to prevent child re-renders
  const handleEdit = useCallback((log: AIFoodLog) => {
    navigation.navigate('EditFood', { log });
  }, [navigation]);

  const handleDelete = useCallback((log: AIFoodLog) => {
    haptics.heavy();
    Alert.alert('Eliminar registro', `¿Eliminar "${log.food_name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            // Demo/offline data (negative IDs) — just remove locally
            if (log.id < 0) {
              setLogs((prev) => prev.filter((l) => l.id !== log.id));
              haptics.success();
              return;
            }
            await foodService.deleteFoodLog(log.id);
            haptics.success();
            setLogs((prev) => prev.filter((l) => l.id !== log.id));
          } catch {
            // Fallback: remove locally even if API fails
            setLogs((prev) => prev.filter((l) => l.id !== log.id));
            haptics.success();
          }
        },
      },
    ]);
  }, []);

  const handleAddWater = useCallback(async (ml: number) => {
    const prev = waterMl;
    track('water_added', { amount_ml: ml });
    setWaterMl((w) => w + ml); // optimistic
    try {
      const res = await foodService.logWater(ml);
      setWaterMl(res.water_ml);
    } catch {
      setWaterMl(prev);
    }
  }, [waterMl, track]);

  const openAddModal = useCallback((mt: MealType) => {
    haptics.light();
    setModalMeal(mt);
  }, []);
  const closeModal = useCallback(() => setModalMeal(null), []);

  const handleScan = useCallback(() => {
    haptics.light();
    closeModal();
    navigation.navigate('Escanear');
  }, [navigation]);

  const handleManual = useCallback(() => {
    haptics.light();
    const mt = modalMeal;
    track('meal_logged_manual', { meal_type: mt });
    closeModal();
    navigation.navigate('AddFood', { mealType: mt });
  }, [modalMeal, closeModal, navigation, track]);

  const handleSearch = useCallback(() => {
    haptics.light();
    const mt = modalMeal;
    closeModal();
    navigation.navigate('FoodSearch', { mealType: mt });
  }, [modalMeal, closeModal, navigation]);

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  // Memoize meal grouping to avoid re-filtering on every render
  const logsByMeal = useMemo(() => {
    const grouped: Record<string, AIFoodLog[]> = {};
    for (const mt of MEAL_ORDER) {
      grouped[mt] = logs.filter((l) => l.meal_type === mt);
    }
    return grouped;
  }, [logs]);

  // Memoize date string to avoid recalculation on every render
  const today = useMemo(() => new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
  }), []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View accessibilityRole="header">
          <Text style={[styles.headerTitle, { color: c.black }]}>Registro</Text>
          <Text style={[styles.headerDate, { color: c.gray }]}>{today}</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.historyBtn, { backgroundColor: c.surface }]}
            onPress={() => navigation.navigate('History')}
            accessibilityLabel="Ver historial de registros"
            accessibilityRole="button"
            accessibilityHint="Navega al historial de comidas registradas"
          >
            <Ionicons name="calendar-outline" size={18} color={c.black} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: c.black }]}
            onPress={() => openAddModal('snack')}
            accessibilityLabel="Anadir alimento"
            accessibilityRole="button"
            accessibilityHint="Abre el menu para anadir una comida"
          >
            <Ionicons name="add" size={22} color={c.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {error && !loading && (
        <TouchableOpacity
          style={[styles.errorBanner, { marginHorizontal: sidePadding, backgroundColor: c.accent }]}
          onPress={() => { setLoading(true); load(); }}
          activeOpacity={0.8}
          accessibilityLabel="Sin conexion, mostrando datos de ejemplo. Toca para reintentar"
          accessibilityRole="button"
        >
          <Ionicons name="wifi-outline" size={14} color={c.white} />
          <Text style={[styles.errorBannerText, { color: c.white }]}>Sin conexion -- datos de ejemplo. Toca para reintentar</Text>
        </TouchableOpacity>
      )}

      {/* Calorie summary strip */}
      <View
        style={[styles.summaryStrip, { marginHorizontal: sidePadding, backgroundColor: c.surface }]}
        accessibilityLabel={`Resumen: ${Math.round(consumed)} calorias consumidas de ${Math.round(target)} objetivo, ${Math.max(0, Math.round(target - consumed))} restantes`}
      >
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(consumed)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>consumidas</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(target)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>objetivo</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.success }]}>
            {Math.max(0, Math.round(target - consumed))}
          </Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>restantes</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={[styles.loadingOverlay, { paddingHorizontal: sidePadding }]}>
          <HomeSkeleton />
        </View>
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Fitsi contextual expression */}
        {logs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <FitsiMascot
              expression="hungry"
              size="medium"
              animation="sad"
              message="Tengo hambre! Registra algo"
            />
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xs }}>
            <FitsiMascot
              expression="happy"
              size="small"
              animation="idle"
            />
          </View>
        )}

        {/* Water tracking */}
        <WaterTracker waterMl={waterMl} onAdd={handleAddWater} />

        {/* Meal sections */}
        {MEAL_ORDER.map((mt) => {
          const meta = MEAL_META[mt];
          const mealLogs = logsByMeal[mt];
          const mealTotal = mealLogs.reduce((s, l) => s + l.calories, 0);

          return (
            <View
              key={mt}
              style={[styles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
              accessibilityLabel={`${meta.label}: ${mealLogs.length > 0 ? `${Math.round(mealTotal)} kilocalorías, ${mealLogs.length} alimento${mealLogs.length > 1 ? 's' : ''}` : 'sin registros'}`}
            >
              <View style={styles.mealHeader}>
                <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <Text style={[styles.mealTitle, { color: c.black }]}>{meta.label}</Text>
                {mealLogs.length > 0 && (
                  <Text style={[styles.mealKcal, { color: c.black }]}>{Math.round(mealTotal)} kcal</Text>
                )}
                <TouchableOpacity
                  onPress={() => openAddModal(mt)}
                  style={styles.mealAddBtn}
                  accessibilityLabel={`Anadir alimento a ${meta.label.toLowerCase()}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={16} color={c.gray} />
                </TouchableOpacity>
              </View>

              {mealLogs.length > 0 ? (
                mealLogs.map((log: AIFoodLog) => (
                  <View
                    key={log.id}
                    style={[styles.foodRow, { borderTopColor: c.grayLight }]}
                    accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorías, proteina ${Math.round(log.protein_g)} gramos, carbohidratos ${Math.round(log.carbs_g)} gramos, grasas ${Math.round(log.fats_g)} gramos`}
                  >
                    <View style={styles.foodInfo}>
                      <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>{log.food_name}</Text>
                      <View style={styles.macroPills}>
                        <Text style={[styles.macroPill, { color: c.gray }]}>P {Math.round(log.protein_g)}g</Text>
                        <Text style={[styles.macroPill, { color: c.gray }]}>C {Math.round(log.carbs_g)}g</Text>
                        <Text style={[styles.macroPill, { color: c.gray }]}>G {Math.round(log.fats_g)}g</Text>
                      </View>
                    </View>
                    <View style={styles.foodRight}>
                      <Text style={[styles.foodKcal, { color: c.black }]}>{Math.round(log.calories)}</Text>
                      <Text style={[styles.foodKcalUnit, { color: c.gray }]}>kcal</Text>
                      <View style={styles.foodActions}>
                        <TouchableOpacity
                          onPress={() => handleEdit(log)}
                          style={styles.actionBtn}
                          accessibilityLabel={`Editar ${log.food_name}`}
                          accessibilityRole="button"
                        >
                          <Ionicons name="create-outline" size={14} color={c.gray} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(log)}
                          style={styles.actionBtn}
                          accessibilityLabel={`Eliminar ${log.food_name}`}
                          accessibilityRole="button"
                        >
                          <Ionicons name="trash-outline" size={14} color={c.gray} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <TouchableOpacity
                  style={styles.emptyMeal}
                  onPress={() => openAddModal(mt)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Anadir ${meta.label.toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityHint={`Abre el menu para anadir un alimento a ${meta.label.toLowerCase()}`}
                >
                  <Ionicons name="add-circle-outline" size={16} color={c.gray} />
                  <Text style={[styles.emptyMealText, { color: c.gray }]}>Añadir {meta.label.toLowerCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
      )}

      <AddSheet
        visible={modalMeal !== null}
        mealType={modalMeal}
        onClose={closeModal}
        onScan={handleScan}
        onManual={handleManual}
        onSearch={handleSearch}
      />

      <ConfettiEffect trigger={confettiTrigger} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleSm },
  headerDate: { ...typography.caption, marginTop: 2, textTransform: 'capitalize' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.caption, flex: 1 },
  summaryStrip: {
    flexDirection: 'row',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.titleSm },
  summaryLabel: { ...typography.caption, marginTop: 2 },
  summaryDivider: { width: 1, height: 28 },
  scroll: { paddingTop: spacing.xs },
  mealCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mealIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: { ...typography.label, flex: 1 },
  mealKcal: { ...typography.caption, fontWeight: '700' },
  mealAddBtn: { padding: 4 },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, marginBottom: 2 },
  macroPills: { flexDirection: 'row', gap: spacing.xs },
  macroPill: { ...typography.caption },
  foodRight: { alignItems: 'flex-end', gap: 2 },
  foodKcal: { ...typography.label },
  foodKcalUnit: { ...typography.caption },
  foodActions: { flexDirection: 'row', gap: 2, marginTop: 2 },
  actionBtn: { padding: 4 },
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  emptyMealText: { ...typography.caption },
});
