/**
 * LogScreen — Diario de alimentos del día
 * Comidas agrupadas por tipo · Eliminar · Añadir manualmente · Tracking de agua
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { MealType } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { HomeSkeleton } from '../../components/SkeletonLoader';

const MEAL_META = mealColors;
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ─── Water quick-add buttons ─────────────────────────────────────────────────
const WATER_AMOUNTS = [150, 200, 250, 350, 500];

function WaterCard({ waterMl, onAdd }: { waterMl: number; onAdd: (ml: number) => void }) {
  const pct = Math.min(waterMl / 2000, 1);

  // Animated fill width for water progress
  const fillAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Bounce animation when water is added
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const handleAdd = (ml: number) => {
    haptics.medium();
    bounceAnim.setValue(1.15);
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
    onAdd(ml);
  };

  return (
    <Animated.View style={[waterStyles.card, { transform: [{ scale: bounceAnim }] }]}>
      <View style={waterStyles.header}>
        <Ionicons name="water" size={18} color={colors.fats} />
        <Text style={waterStyles.title}>Agua</Text>
        <Text style={waterStyles.value}>
          {waterMl} <Text style={waterStyles.unit}>/ 2000 ml</Text>
        </Text>
      </View>
      <View
        style={waterStyles.track}
        accessibilityLabel={`Agua: ${waterMl} de 2000 mililitros`}
        accessibilityRole="progressbar"
      >
        <Animated.View style={[waterStyles.fill, { width: fillWidth as any }]} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
        <View style={waterStyles.btnRow}>
          {WATER_AMOUNTS.map((ml) => (
            <TouchableOpacity
              key={ml}
              style={waterStyles.btn}
              onPress={() => handleAdd(ml)}
              activeOpacity={0.7}
              accessibilityLabel={`Agregar ${ml} mililitros de agua`}
              accessibilityRole="button"
            >
              <Text style={waterStyles.btnText}>+{ml}ml</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const waterStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  title: { ...typography.label, color: colors.black, flex: 1 },
  value: { ...typography.label, color: colors.fats },
  unit: { ...typography.caption, color: colors.gray },
  track: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.fats, borderRadius: 3 },
  btnRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 },
  btn: {
    backgroundColor: '#EFF6FF',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  btnText: { ...typography.caption, color: colors.fats, fontWeight: '700' },
});

// ─── Add options modal ────────────────────────────────────────────────────────
function AddModal({
  visible,
  mealType,
  onClose,
  onScan,
  onManual,
}: {
  visible: boolean;
  mealType: MealType | null;
  onClose: () => void;
  onScan: () => void;
  onManual: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>
            Añadir a {mealType ? MEAL_META[mealType]?.label : 'comida'}
          </Text>
          <TouchableOpacity style={modalStyles.option} onPress={onScan} activeOpacity={0.7}>
            <View style={[modalStyles.optIcon, { backgroundColor: colors.black }]}>
              <Ionicons name="camera" size={20} color={colors.white} />
            </View>
            <View>
              <Text style={modalStyles.optLabel}>Escanear con IA</Text>
              <Text style={modalStyles.optSub}>Saca una foto a tu comida</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.grayLight} />
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.option} onPress={onManual} activeOpacity={0.7}>
            <View style={[modalStyles.optIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="create-outline" size={20} color={colors.black} />
            </View>
            <View>
              <Text style={modalStyles.optLabel}>Añadir manualmente</Text>
              <Text style={modalStyles.optSub}>Escribe el nombre y macros</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.grayLight} />
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: { ...typography.label, color: colors.gray, textAlign: 'center', marginBottom: spacing.xs },
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
  optLabel: { ...typography.bodyMd, color: colors.black },
  optSub: { ...typography.caption, color: colors.gray, marginTop: 2 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [waterMl, setWaterMl] = useState(0);
  const [modalMeal, setModalMeal] = useState<MealType | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(),
        foodService.getDailySummary(),
      ]);
      if (l.status === 'fulfilled') setLogs(l.value);
      else setError(true);
      if (s.status === 'fulfilled') {
        setSummary(s.value);
        setWaterMl(s.value.water_ml ?? 0);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleEdit = (log: AIFoodLog) => {
    navigation.navigate('EditFood', { log });
  };

  const handleDelete = (log: AIFoodLog) => {
    haptics.heavy();
    Alert.alert('Eliminar registro', `¿Eliminar "${log.food_name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await foodService.deleteFoodLog(log.id);
            haptics.success();
            setLogs((prev) => prev.filter((l) => l.id !== log.id));
          } catch {
            haptics.error();
            Alert.alert('Error', 'No se pudo eliminar el registro.');
          }
        },
      },
    ]);
  };

  const handleAddWater = async (ml: number) => {
    const prev = waterMl;
    setWaterMl((w) => w + ml); // optimistic
    try {
      const res = await foodService.logWater(ml);
      setWaterMl(res.water_ml);
    } catch {
      setWaterMl(prev);
    }
  };

  const openAddModal = (mt: MealType) => {
    haptics.light();
    setModalMeal(mt);
  };
  const closeModal = () => setModalMeal(null);

  const handleScan = () => {
    haptics.light();
    closeModal();
    navigation.navigate('Escanear');
  };

  const handleManual = () => {
    haptics.light();
    const mt = modalMeal;
    closeModal();
    navigation.navigate('AddFood', { mealType: mt });
  };

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of MEAL_ORDER) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }

  const today = new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View>
          <Text style={styles.headerTitle}>Registro</Text>
          <Text style={styles.headerDate}>{today}</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => navigation.navigate('History')}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.black} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => openAddModal('snack')}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {error && !loading && (
        <TouchableOpacity
          style={[styles.errorBanner, { marginHorizontal: sidePadding }]}
          onPress={() => { setLoading(true); load(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="wifi-outline" size={14} color={colors.white} />
          <Text style={styles.errorBannerText}>No se pudo cargar. Toca para reintentar</Text>
        </TouchableOpacity>
      )}

      {/* Calorie summary strip */}
      <View style={[styles.summaryStrip, { marginHorizontal: sidePadding }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(consumed)}</Text>
          <Text style={styles.summaryLabel}>consumidas</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(target)}</Text>
          <Text style={styles.summaryLabel}>objetivo</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {Math.max(0, Math.round(target - consumed))}
          </Text>
          <Text style={styles.summaryLabel}>restantes</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={[styles.loadingOverlay, { paddingHorizontal: sidePadding }]}>
          <HomeSkeleton />
        </View>
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Water tracking */}
        <WaterCard waterMl={waterMl} onAdd={handleAddWater} />

        {/* Meal sections */}
        {MEAL_ORDER.map((mt) => {
          const meta = MEAL_META[mt];
          const mealLogs = logsByMeal[mt];
          const mealTotal = mealLogs.reduce((s, l) => s + l.calories, 0);

          return (
            <View key={mt} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <Text style={styles.mealTitle}>{meta.label}</Text>
                {mealLogs.length > 0 && (
                  <Text style={styles.mealKcal}>{Math.round(mealTotal)} kcal</Text>
                )}
                <TouchableOpacity onPress={() => openAddModal(mt)} style={styles.mealAddBtn}>
                  <Ionicons name="add" size={16} color={colors.gray} />
                </TouchableOpacity>
              </View>

              {mealLogs.length > 0 ? (
                mealLogs.map((log) => (
                  <View key={log.id} style={styles.foodRow}>
                    <View style={styles.foodInfo}>
                      <Text style={styles.foodName} numberOfLines={1}>{log.food_name}</Text>
                      <View style={styles.macroPills}>
                        <Text style={styles.macroPill}>P {Math.round(log.protein_g)}g</Text>
                        <Text style={styles.macroPill}>C {Math.round(log.carbs_g)}g</Text>
                        <Text style={styles.macroPill}>G {Math.round(log.fats_g)}g</Text>
                      </View>
                    </View>
                    <View style={styles.foodRight}>
                      <Text style={styles.foodKcal}>{Math.round(log.calories)}</Text>
                      <Text style={styles.foodKcalUnit}>kcal</Text>
                      <View style={styles.foodActions}>
                        <TouchableOpacity onPress={() => handleEdit(log)} style={styles.actionBtn}>
                          <Ionicons name="create-outline" size={14} color={colors.gray} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(log)} style={styles.actionBtn}>
                          <Ionicons name="trash-outline" size={14} color={colors.gray} />
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
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.gray} />
                  <Text style={styles.emptyMealText}>Añadir {meta.label.toLowerCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
      )}

      <AddModal
        visible={modalMeal !== null}
        mealType={modalMeal}
        onClose={closeModal}
        onScan={handleScan}
        onManual={handleManual}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  headerDate: { ...typography.caption, color: colors.gray, marginTop: 2, textTransform: 'capitalize' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.caption, color: colors.white, flex: 1 },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.titleSm, color: colors.black },
  summaryLabel: { ...typography.caption, color: colors.gray, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.grayLight },
  scroll: { paddingTop: spacing.xs },
  mealCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
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
  mealTitle: { ...typography.label, color: colors.black, flex: 1 },
  mealKcal: { ...typography.caption, fontWeight: '700', color: colors.black },
  mealAddBtn: { padding: 4 },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, color: colors.black, marginBottom: 2 },
  macroPills: { flexDirection: 'row', gap: spacing.xs },
  macroPill: { ...typography.caption, color: colors.gray },
  foodRight: { alignItems: 'flex-end', gap: 2 },
  foodKcal: { ...typography.label, color: colors.black },
  foodKcalUnit: { ...typography.caption, color: colors.gray },
  foodActions: { flexDirection: 'row', gap: 2, marginTop: 2 },
  actionBtn: { padding: 4 },
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  emptyMealText: { ...typography.caption, color: colors.gray },
});
