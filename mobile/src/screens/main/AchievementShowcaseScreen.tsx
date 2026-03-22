/**
 * AchievementShowcaseScreen — Grid of all achievements grouped by category tabs.
 * Categories: Constancia, Adherencia, Proteina, Equilibrio, Reinicio, Rachas, Misiones, Desafios.
 * Tapping achievement shows detail modal with description + date unlocked.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import AchievementBadge, { AchievementData } from '../../components/AchievementBadge';

// ─── Category definitions ──────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'constancia', label: 'Constancia', icon: 'calendar' },
  { key: 'adherencia', label: 'Adherencia', icon: 'checkmark-circle' },
  { key: 'proteina', label: 'Proteina', icon: 'fitness' },
  { key: 'equilibrio', label: 'Equilibrio', icon: 'scale' },
  { key: 'reinicio', label: 'Reinicio', icon: 'refresh' },
  { key: 'rachas', label: 'Rachas', icon: 'flame' },
  { key: 'misiones', label: 'Misiones', icon: 'flag' },
  { key: 'desafios', label: 'Desafios', icon: 'trophy' },
] as const;

// ─── Mock achievements (will be replaced by API data from useProgress) ─────

const MOCK_ACHIEVEMENTS: AchievementData[] = [
  { id: 'con_1', name: 'Primera semana', description: 'Registra comida 7 dias seguidos', icon: 'calendar', rarity: 'common', category: 'constancia', unlockedAt: '2026-03-15' },
  { id: 'con_2', name: 'Mes perfecto', description: 'Registra comida 30 dias seguidos', icon: 'calendar', rarity: 'rare', category: 'constancia', unlockedAt: null },
  { id: 'con_3', name: 'Trimestre dorado', description: 'Registra comida 90 dias seguidos', icon: 'calendar', rarity: 'epic', category: 'constancia', unlockedAt: null },
  { id: 'adh_1', name: 'En el blanco', description: 'Cumple tu objetivo calorico 3 dias', icon: 'checkmark-circle', rarity: 'common', category: 'adherencia', unlockedAt: '2026-03-10' },
  { id: 'adh_2', name: 'Precision total', description: 'Cumple tu objetivo calorico 14 dias', icon: 'checkmark-circle', rarity: 'rare', category: 'adherencia', unlockedAt: null },
  { id: 'adh_3', name: 'Maestro nutricional', description: 'Cumple tu objetivo calorico 30 dias', icon: 'checkmark-circle', rarity: 'epic', category: 'adherencia', unlockedAt: null },
  { id: 'pro_1', name: 'Proteina power', description: 'Cumple tu meta de proteina 3 dias', icon: 'fitness', rarity: 'common', category: 'proteina', unlockedAt: '2026-03-12' },
  { id: 'pro_2', name: 'Constructor muscular', description: 'Cumple tu meta de proteina 14 dias', icon: 'fitness', rarity: 'rare', category: 'proteina', unlockedAt: null },
  { id: 'pro_3', name: 'Maquina de proteina', description: 'Cumple tu meta de proteina 30 dias', icon: 'fitness', rarity: 'epic', category: 'proteina', unlockedAt: null },
  { id: 'eq_1', name: 'Equilibrado', description: 'Cumple 3 macros en un mismo dia', icon: 'scale', rarity: 'common', category: 'equilibrio', unlockedAt: '2026-03-08' },
  { id: 'eq_2', name: 'Armonioso', description: 'Cumple 3 macros por 7 dias seguidos', icon: 'scale', rarity: 'rare', category: 'equilibrio', unlockedAt: null },
  { id: 'eq_3', name: 'Balance perfecto', description: 'Cumple 3 macros por 30 dias seguidos', icon: 'scale', rarity: 'epic', category: 'equilibrio', unlockedAt: null },
  { id: 'rei_1', name: 'Nuevo comienzo', description: 'Retoma el tracking despues de 3+ dias sin registrar', icon: 'refresh', rarity: 'common', category: 'reinicio', unlockedAt: '2026-03-18' },
  { id: 'rei_2', name: 'Resiliente', description: 'Retoma el tracking 3 veces', icon: 'refresh', rarity: 'rare', category: 'reinicio', unlockedAt: null },
  { id: 'rac_1', name: 'Fuego inicial', description: 'Racha de 3 dias', icon: 'flame', rarity: 'common', category: 'rachas', unlockedAt: '2026-03-14' },
  { id: 'rac_2', name: 'Llama eterna', description: 'Racha de 14 dias', icon: 'flame', rarity: 'rare', category: 'rachas', unlockedAt: null },
  { id: 'rac_3', name: 'Inferno', description: 'Racha de 30 dias', icon: 'flame', rarity: 'epic', category: 'rachas', unlockedAt: null },
  { id: 'mis_1', name: 'Misionero', description: 'Completa 10 misiones diarias', icon: 'flag', rarity: 'common', category: 'misiones', unlockedAt: '2026-03-16' },
  { id: 'mis_2', name: 'Estratega', description: 'Completa 50 misiones diarias', icon: 'flag', rarity: 'rare', category: 'misiones', unlockedAt: null },
  { id: 'mis_3', name: 'Leyenda', description: 'Completa 100 misiones diarias', icon: 'flag', rarity: 'epic', category: 'misiones', unlockedAt: null },
  { id: 'des_1', name: 'Retador', description: 'Completa tu primer desafio semanal', icon: 'trophy', rarity: 'common', category: 'desafios', unlockedAt: '2026-03-17' },
  { id: 'des_2', name: 'Campeon', description: 'Completa 10 desafios semanales', icon: 'trophy', rarity: 'rare', category: 'desafios', unlockedAt: null },
  { id: 'des_3', name: 'Invencible', description: 'Completa 25 desafios semanales', icon: 'trophy', rarity: 'epic', category: 'desafios', unlockedAt: null },
];

// ─── Screen ───────────────────────────────────────────────────────────────

export default function AchievementShowcaseScreen({ navigation }: any) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].key);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementData | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const itemSize = Math.round((screenWidth - spacing.lg * 2 - spacing.sm * 2) / 3);

  const filteredAchievements = useMemo(
    () => MOCK_ACHIEVEMENTS.filter((a) => a.category === activeCategory),
    [activeCategory],
  );

  const unlockedCount = useMemo(
    () => filteredAchievements.filter((a) => a.unlockedAt != null).length,
    [filteredAchievements],
  );

  const totalUnlocked = useMemo(
    () => MOCK_ACHIEVEMENTS.filter((a) => a.unlockedAt != null).length,
    [],
  );

  const onSelectCategory = useCallback((key: string) => {
    haptics.selection();
    setActiveCategory(key);
  }, []);

  const onPressAchievement = useCallback((achievement: AchievementData) => {
    setSelectedAchievement(achievement);
  }, []);

  const onCloseModal = useCallback(() => {
    setSelectedAchievement(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: AchievementData }) => (
      <View style={{ width: itemSize, alignItems: 'center', marginBottom: spacing.md }}>
        <AchievementBadge
          achievement={item}
          unlocked={item.unlockedAt != null}
          onPress={onPressAchievement}
          size={Math.round(itemSize * 0.8)}
        />
      </View>
    ),
    [itemSize, onPressAchievement],
  );

  const keyExtractor = useCallback((item: AchievementData) => item.id, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { haptics.light(); navigation.goBack(); }}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.black }]}>Logros</Text>
        <Text style={[styles.counter, { color: c.gray }]}>
          {totalUnlocked}/{MOCK_ACHIEVEMENTS.length}
        </Text>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
        style={styles.tabContainer}
      >
        {CATEGORIES.map((cat) => {
          const isActive = cat.key === activeCategory;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => onSelectCategory(cat.key)}
              style={[
                styles.tab,
                { backgroundColor: isActive ? c.black : c.surface, borderColor: c.grayLight },
              ]}
              activeOpacity={0.8}
              accessibilityLabel={`Categoria ${cat.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={isActive ? c.white : c.gray}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? c.white : c.gray },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Unlocked counter */}
      <View style={styles.categoryCount}>
        <Text style={[styles.categoryCountText, { color: c.gray }]}>
          {unlockedCount}/{filteredAchievements.length} desbloqueados
        </Text>
      </View>

      {/* Achievement grid */}
      <FlatList
        data={filteredAchievements}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={3}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {/* Detail modal */}
      <Modal
        visible={selectedAchievement != null}
        transparent
        animationType="fade"
        onRequestClose={onCloseModal}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onCloseModal}
        >
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            {selectedAchievement && (
              <>
                <AchievementBadge
                  achievement={selectedAchievement}
                  unlocked={selectedAchievement.unlockedAt != null}
                  size={100}
                />
                <Text style={[styles.modalName, { color: c.black }]}>
                  {selectedAchievement.name}
                </Text>
                <Text style={[styles.modalDesc, { color: c.gray }]}>
                  {selectedAchievement.description}
                </Text>
                {selectedAchievement.unlockedAt && (
                  <View style={styles.modalDateRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#34A853" />
                    <Text style={[styles.modalDate, { color: '#34A853' }]}>
                      Desbloqueado el {selectedAchievement.unlockedAt}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={onCloseModal}
                  style={[styles.modalClose, { backgroundColor: c.grayLight }]}
                  accessibilityLabel="Cerrar"
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalCloseText, { color: c.black }]}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleMd,
    flex: 1,
  },
  counter: {
    ...typography.label,
  },
  tabContainer: {
    maxHeight: 44,
  },
  tabScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  categoryCount: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  categoryCountText: {
    ...typography.caption,
    fontWeight: '500',
  },
  grid: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
    gap: spacing.sm,
    ...shadows.lg,
  },
  modalName: {
    ...typography.titleSm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  modalDesc: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  modalDate: {
    ...typography.caption,
    fontWeight: '600',
  },
  modalClose: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCloseText: {
    ...typography.button,
    textAlign: 'center',
  },
});
