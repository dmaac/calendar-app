/**
 * RewardsShopScreen — Coin rewards shop.
 * User's coin balance at top, grid of rewards, "Canjear" button,
 * disabled if not enough coins, confirmation modal.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  category: string;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const REWARDS: Reward[] = [
  { id: 'r1', name: 'Tema oscuro premium', description: 'Desbloquea colores exclusivos para modo oscuro', icon: 'moon', cost: 200, category: 'personalizacion' },
  { id: 'r2', name: 'Streak Freeze extra', description: 'Obtiene un freeze adicional para proteger tu racha', icon: 'snow', cost: 150, category: 'ventajas' },
  { id: 'r3', name: 'Icono de app exclusivo', description: 'Cambia el icono de la app por uno especial', icon: 'apps', cost: 300, category: 'personalizacion' },
  { id: 'r4', name: 'Fitsi dorado', description: 'Desbloquea la version dorada de Fitsi', icon: 'star', cost: 500, category: 'personalizacion' },
  { id: 'r5', name: 'Recetas premium', description: 'Accede a 10 recetas exclusivas', icon: 'restaurant', cost: 250, category: 'contenido' },
  { id: 'r6', name: 'Analisis detallado', description: 'Reporte semanal con insights avanzados', icon: 'analytics', cost: 180, category: 'contenido' },
  { id: 'r7', name: 'Doblar XP 24h', description: 'Gana el doble de XP durante 24 horas', icon: 'flash', cost: 120, category: 'ventajas' },
  { id: 'r8', name: 'Marco de perfil', description: 'Marco especial para tu foto de perfil', icon: 'image', cost: 350, category: 'personalizacion' },
  { id: 'r9', name: 'Sonidos de logro', description: 'Pack de sonidos exclusivos para logros', icon: 'musical-notes', cost: 100, category: 'personalizacion' },
  { id: 'r10', name: 'Coach IA premium', description: 'Sesion de coach IA con consejos personalizados', icon: 'chatbubbles', cost: 400, category: 'contenido' },
];

// ─── Reward Card ──────────────────────────────────────────────────────────

const RewardCard = React.memo(function RewardCard({
  reward,
  canAfford,
  onPress,
}: {
  reward: Reward;
  canAfford: boolean;
  onPress: (reward: Reward) => void;
}) {
  const c = useThemeColors();

  return (
    <View
      style={[
        styles.rewardCard,
        { backgroundColor: c.surface, borderColor: c.grayLight },
        !canAfford && styles.disabledCard,
      ]}
      accessibilityLabel={`${reward.name}: ${Math.round(reward.cost)} monedas. ${canAfford ? 'Disponible' : 'No tienes suficientes monedas'}`}
    >
      <View style={[styles.rewardIcon, { backgroundColor: canAfford ? c.primary : c.grayLight }]}>
        <Ionicons
          name={reward.icon as any}
          size={24}
          color={canAfford ? '#FFFFFF' : c.disabled}
        />
      </View>
      <Text
        style={[styles.rewardName, { color: canAfford ? c.black : c.disabled }]}
        numberOfLines={2}
      >
        {reward.name}
      </Text>
      <View style={styles.costRow}>
        <Ionicons name="ellipse" size={12} color={canAfford ? '#FBBF24' : c.disabled} />
        <Text style={[styles.costText, { color: canAfford ? c.black : c.disabled }]}>
          {Math.round(reward.cost)}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.redeemBtn,
          { backgroundColor: canAfford ? c.black : c.disabledBg },
        ]}
        onPress={() => { haptics.light(); onPress(reward); }}
        disabled={!canAfford}
        activeOpacity={0.85}
        accessibilityLabel={`Canjear ${reward.name}`}
        accessibilityRole="button"
      >
        <Text style={[styles.redeemText, { color: canAfford ? '#FFFFFF' : c.disabled }]}>
          Canjear
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function RewardsShopScreen({ navigation }: any) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  // Mock balance (will come from useProgress hook)
  const [coins, setCoins] = useState(340);
  const [confirmReward, setConfirmReward] = useState<Reward | null>(null);
  const [redeemed, setRedeemed] = useState<Set<string>>(new Set());

  const availableRewards = useMemo(
    () => REWARDS.filter((r) => !redeemed.has(r.id)),
    [redeemed],
  );

  const onPressRedeem = useCallback((reward: Reward) => {
    setConfirmReward(reward);
  }, []);

  const onConfirmRedeem = useCallback(() => {
    if (!confirmReward) return;
    if (coins >= confirmReward.cost) {
      haptics.success();
      setCoins((prev) => prev - confirmReward.cost);
      setRedeemed((prev) => new Set(prev).add(confirmReward.id));
    }
    setConfirmReward(null);
  }, [confirmReward, coins]);

  const onCancelRedeem = useCallback(() => {
    setConfirmReward(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Reward }) => (
      <RewardCard
        reward={item}
        canAfford={coins >= item.cost}
        onPress={onPressRedeem}
      />
    ),
    [coins, onPressRedeem],
  );

  const keyExtractor = useCallback((item: Reward) => item.id, []);

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
        <Text style={[styles.title, { color: c.black }]}>Tienda</Text>
        <View style={styles.balanceBadge}>
          <Ionicons name="ellipse" size={14} color="#FBBF24" />
          <Text style={[styles.balanceText, { color: c.black }]}>{Math.round(coins)}</Text>
        </View>
      </View>

      {/* Balance card */}
      <View style={[styles.balanceCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <View style={styles.balanceInfo}>
          <Text style={[styles.balanceLabel, { color: c.gray }]}>Tu saldo</Text>
          <View style={styles.balanceRow}>
            <Ionicons name="ellipse" size={20} color="#FBBF24" />
            <Text style={[styles.balanceAmount, { color: c.black }]}>{Math.round(coins)}</Text>
            <Text style={[styles.balanceCurrency, { color: c.gray }]}>monedas</Text>
          </View>
        </View>
      </View>

      {/* Rewards grid */}
      <FlatList
        data={availableRewards}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={48} color={c.grayLight} />
            <Text style={[styles.emptyText, { color: c.gray }]}>
              Has canjeado todas las recompensas!
            </Text>
          </View>
        }
      />

      {/* Confirmation modal */}
      <Modal
        visible={confirmReward != null}
        transparent
        animationType="fade"
        onRequestClose={onCancelRedeem}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onCancelRedeem}
        >
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            {confirmReward && (
              <>
                <View style={[styles.modalIcon, { backgroundColor: c.primary }]}>
                  <Ionicons name={confirmReward.icon as any} size={32} color="#FFFFFF" />
                </View>
                <Text style={[styles.modalTitle, { color: c.black }]}>
                  Canjear {confirmReward.name}?
                </Text>
                <Text style={[styles.modalDesc, { color: c.gray }]}>
                  {confirmReward.description}
                </Text>
                <View style={styles.modalCost}>
                  <Ionicons name="ellipse" size={16} color="#FBBF24" />
                  <Text style={[styles.modalCostText, { color: c.black }]}>
                    {Math.round(confirmReward.cost)} monedas
                  </Text>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: c.grayLight }]}
                    onPress={onCancelRedeem}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modalBtnText, { color: c.black }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: c.black }]}
                    onPress={onConfirmRedeem}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
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
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceText: {
    ...typography.label,
    fontWeight: '800',
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  balanceInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  balanceLabel: {
    ...typography.caption,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  balanceCurrency: {
    ...typography.body,
    fontWeight: '500',
  },
  gridContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  gridRow: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rewardCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  disabledCard: {
    opacity: 0.6,
  },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardName: {
    ...typography.label,
    textAlign: 'center',
    lineHeight: 17,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  costText: {
    fontSize: 14,
    fontWeight: '700',
  },
  redeemBtn: {
    width: '100%',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  redeemText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
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
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  modalDesc: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalCost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  modalCostText: {
    ...typography.label,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  modalBtnText: {
    ...typography.button,
  },
});
