/**
 * CoachScreen — AI Coach Chat
 *
 * Real chat interface powered by the backend AI coach API.
 * Features:
 *   - Inverted FlatList for proper chat UX (newest message at bottom)
 *   - Bubble-style messages: user (right, solid accent) + coach (left, surface)
 *   - Auto-loads daily insight on first open (empty history)
 *   - Horizontal-scrollable quick-suggestion chips
 *   - Fitsi mascot avatar on coach messages with "thinking" animation
 *   - Animated three-dot typing indicator while AI responds
 *   - KeyboardAvoidingView with correct platform offset
 *   - Error banner with dismiss + retry last message
 *   - Message history persisted via useCoach hook (AsyncStorage)
 *   - Long-press bubble to copy text
 *   - Clear history option in header menu
 *   - Human support fallback link
 *   - Dark mode compatible via theme system
 *   - Full accessibility labels on all interactive elements
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useCoach, CoachMessage } from '../../hooks/useCoach';
import { usePremium } from '../../hooks/usePremium';
import PremiumGate from '../../components/PremiumGate';

// ─── Quick suggestion chips ──────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Que como de almuerzo?', icon: 'restaurant-outline' as const },
  { label: 'Como voy hoy?',         icon: 'trending-up-outline' as const },
  { label: 'Sugiere un snack',       icon: 'cafe-outline' as const },
  { label: 'Cuantas calorias me quedan?', icon: 'flame-outline' as const },
  { label: 'Ideas para cenar',       icon: 'moon-outline' as const },
] as const;

// ─── Animated typing dots ─────────────────────────────────────────────────────

const TypingDots = React.memo(function TypingDots({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -5,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600),
        ]),
      );

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 150);
    const a3 = animateDot(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={dotsStyles.row} accessibilityLabel="El coach esta escribiendo">
      {([dot1, dot2, dot3] as Animated.Value[]).map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            dotsStyles.dot,
            { backgroundColor: color, transform: [{ translateY: dot }] },
          ]}
        />
      ))}
    </View>
  );
});

const dotsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    height: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    opacity: 0.7,
  },
});

// ─── Typing indicator bubble (memoized) ──────────────────────────────────────

const TypingIndicator = React.memo(function TypingIndicator({
  c,
}: {
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowCoach]}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chatbubble-ellipses" size={18} color={c.accent} />
      </View>
      <View
        style={[
          styles.bubble,
          styles.bubbleCoach,
          styles.typingBubble,
          { backgroundColor: c.surface },
        ]}
        accessibilityLabel="Coach escribiendo"
        accessibilityRole="text"
      >
        <TypingDots color={c.gray} />
      </View>
    </View>
  );
});

// ─── Chat bubble (memoized) ───────────────────────────────────────────────────

const ChatBubble = React.memo(function ChatBubble({
  message,
  c,
  onLongPress,
}: {
  message: CoachMessage;
  c: ReturnType<typeof useThemeColors>;
  onLongPress: (text: string) => void;
}) {
  return (
    <View
      style={[
        styles.bubbleRow,
        message.isUser ? styles.bubbleRowUser : styles.bubbleRowCoach,
      ]}
    >
      {!message.isUser && (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chatbubble-ellipses" size={18} color={c.accent} />
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(message.text)}
        accessibilityLabel={`${message.isUser ? 'Tu mensaje' : 'Mensaje del coach'}: ${message.text}`}
        accessibilityRole="text"
        accessibilityHint="Manten presionado para compartir"
        delayLongPress={400}
      >
        <View
          style={[
            styles.bubble,
            message.isUser
              ? [styles.bubbleUser, { backgroundColor: c.accent }]
              : [styles.bubbleCoach, { backgroundColor: c.surface }],
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: message.isUser ? colors.white : c.black },
            ]}
          >
            {message.text}
          </Text>
          <Text
            style={[
              styles.timestamp,
              { color: message.isUser ? 'rgba(255,255,255,0.65)' : c.disabled },
            ]}
          >
            {formatTime(message.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CoachScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Coach');
  const { isPremium, showPaywall } = usePremium();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const insightLoadedRef = useRef(false);
  const lastMessageTextRef = useRef<string>('');

  const {
    messages,
    loading,
    error,
    sendMessage,
    loadInsight,
    clearHistory,
    dismissError,
  } = useCoach();

  // ── Load daily insight on first open (only if no history) ──────────────────

  useEffect(() => {
    if (insightLoadedRef.current) return;
    insightLoadedRef.current = true;

    if (messages.length === 0) {
      loadInsight();
      track('coach_insight_loaded');
    }
  }, [messages.length, loadInsight, track]);

  // ── Send handler ────────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      haptics.light();
      track('coach_message_sent', { message_length: trimmed.length });
      lastMessageTextRef.current = trimmed;
      setInputText('');
      await sendMessage(trimmed);
    },
    [loading, sendMessage, track],
  );

  // ── Retry last message ──────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    haptics.light();
    dismissError();
    if (lastMessageTextRef.current) {
      track('coach_retry');
      sendMessage(lastMessageTextRef.current);
    }
  }, [dismissError, sendMessage, track]);

  // ── Suggestion chip handler ─────────────────────────────────────────────────

  const handleSuggestion = useCallback(
    (text: string) => {
      haptics.light();
      track('coach_suggestion_tapped', { suggestion: text });
      handleSend(text);
    },
    [handleSend, track],
  );

  // ── Dismiss error ───────────────────────────────────────────────────────────

  const handleDismissError = useCallback(() => {
    haptics.light();
    dismissError();
  }, [dismissError]);

  // ── Share bubble text on long press ─────────────────────────────────────────

  const handleBubbleLongPress = useCallback(
    async (text: string) => {
      haptics.light();
      track('coach_message_shared');
      try {
        await Share.share({ message: text });
      } catch {
        // User cancelled or share not supported — silent fail
      }
    },
    [track],
  );

  // ── Clear history ───────────────────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    setShowMenu(false);
    Alert.alert(
      'Borrar historial',
      'Se eliminara toda la conversacion con el coach. Esta accion no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            haptics.medium();
            track('coach_history_cleared');
            await clearHistory();
            insightLoadedRef.current = false;
            lastMessageTextRef.current = '';
            loadInsight();
          },
        },
      ],
    );
  }, [clearHistory, loadInsight, track]);

  // ── FlatList callbacks (stable refs) ───────────────────────────────────────

  const renderChatItem = useCallback(
    ({ item }: { item: CoachMessage }) => (
      <ChatBubble message={item} c={c} onLongPress={handleBubbleLongPress} />
    ),
    [c, handleBubbleLongPress],
  );

  const chatKeyExtractor = useCallback((item: CoachMessage) => item.id, []);

  // ── Sanitize input on change ────────────────────────────────────────────────

  const handleInputChange = useCallback((t: string) => {
    setInputText(t.replace(/<[^>]*>/g, '').slice(0, 500));
  }, []);

  // ── Determine if suggestions should show ───────────────────────────────────

  const showSuggestions = messages.length <= 2 && !loading;

  // Inverted FlatList: data must be reversed so newest is at index 0
  const invertedMessages = [...messages].reverse();

  // ── Premium gate: free users see the first coach message, then a lock overlay ──
  if (!isPremium && messages.length > 0) {
    const firstMessage = messages[0];
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <View style={{ height: insets.top, backgroundColor: c.bg }} />

        {/* Header (same as full version) */}
        <View
          style={[
            styles.header,
            { paddingHorizontal: sidePadding, borderBottomColor: c.border, backgroundColor: c.bg },
          ]}
        >
          <TouchableOpacity
            onPress={() => { haptics.light(); navigation.goBack(); }}
            style={[styles.headerBtn, { backgroundColor: c.surface }]}
            accessibilityLabel="Volver a la pantalla anterior"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={22} color={c.black} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.onlineDot, { backgroundColor: c.success }]} />
              <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
                AI Coach
              </Text>
            </View>
            <Text style={[styles.headerSubtitle, { color: c.gray }]}>
              Nutricion personalizada
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {/* First message preview */}
        <View style={{ paddingHorizontal: sidePadding, paddingTop: spacing.md }}>
          <View style={[styles.bubbleRow, styles.bubbleRowCoach]}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={18} color={c.accent} />
            </View>
            <View style={[styles.bubble, styles.bubbleCoach, { backgroundColor: c.surface }]}>
              <Text style={[styles.bubbleText, { color: c.black }]} numberOfLines={4}>
                {firstMessage.text}
              </Text>
            </View>
          </View>
        </View>

        {/* Premium gate overlay */}
        <PremiumGate
          title="Desbloquea el AI Coach"
          subtitle="Obtiene consejos personalizados de nutricion, respuestas ilimitadas y recomendaciones adaptadas a tu perfil."
          onUpgrade={showPaywall}
          showFeatures
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      {/* ── Safe area top ───────────────────────────────────────────────────── */}
      <View style={{ height: insets.top, backgroundColor: c.bg }} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { paddingHorizontal: sidePadding, borderBottomColor: c.border, backgroundColor: c.bg },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          style={[styles.headerBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver a la pantalla anterior"
          accessibilityRole="button"
          accessibilityHint="Cierra el chat del coach"
        >
          <Ionicons name="chevron-back" size={22} color={c.black} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.onlineDot, { backgroundColor: c.success }]} />
            <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
              AI Coach
            </Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>
            Nutricion personalizada
          </Text>
        </View>

        {/* Menu button */}
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            setShowMenu((v) => !v);
          }}
          style={[styles.headerBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Menu de opciones del chat"
          accessibilityRole="button"
          accessibilityHint="Abre opciones como borrar historial"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={c.black} />
        </TouchableOpacity>
      </View>

      {/* ── Dropdown menu ───────────────────────────────────────────────────── */}
      {showMenu && (
        <View
          style={[
            styles.dropdownMenu,
            shadows.md,
            { backgroundColor: c.surface, borderColor: c.border, right: sidePadding },
          ]}
        >
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              haptics.light();
              track('coach_human_support_tapped');
              Linking.openURL('mailto:support@fitsi.app?subject=Soporte%20Fitsi%20App');
            }}
            accessibilityLabel="Contactar soporte humano"
            accessibilityRole="button"
          >
            <Ionicons name="headset-outline" size={16} color={c.accent} />
            <Text style={[styles.menuItemText, { color: c.black }]}>Soporte humano</Text>
          </TouchableOpacity>

          <View style={[styles.menuDivider, { backgroundColor: c.border }]} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleClearHistory}
            accessibilityLabel="Borrar historial de conversacion"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color={c.protein} />
            <Text style={[styles.menuItemText, { color: c.protein }]}>Borrar historial</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tap-away to close menu */}
      {showMenu && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => setShowMenu(false)}
          activeOpacity={1}
          accessibilityLabel="Cerrar menu"
        />
      )}

      {/* ── Messages (inverted FlatList) ────────────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={invertedMessages}
        keyExtractor={chatKeyExtractor}
        renderItem={renderChatItem}
        inverted
        contentContainerStyle={[
          styles.messageList,
          { paddingHorizontal: sidePadding },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        scrollEventThrottle={16}
        bounces
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListHeaderComponent={loading ? <TypingIndicator c={c} /> : null}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListFooterComponent={
          messages.length === 0 && !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: c.black }]}>
                Hola! Soy tu coach de nutricion
              </Text>
              <Text style={[styles.emptyText, { color: c.gray }]}>
                Preguntame sobre comidas, recetas, tu progreso o cualquier duda de alimentacion.
              </Text>
            </View>
          ) : null
        }
      />

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: c.surface, marginHorizontal: sidePadding },
          ]}
          accessibilityRole="alert"
          accessibilityLabel={`Error: ${error}`}
        >
          <Ionicons name="warning-outline" size={16} color={c.protein} />
          <Text style={[styles.errorText, { color: c.protein }]} numberOfLines={2}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            style={[styles.retryBtn, { backgroundColor: c.accent + '18' }]}
            accessibilityLabel="Reintentar enviar mensaje"
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: c.accent }]}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDismissError}
            accessibilityLabel="Descartar error"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={c.gray} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Quick suggestions (horizontal scroll) ────────────────────────────── */}
      {showSuggestions && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.suggestionsRow,
            { paddingHorizontal: sidePadding },
          ]}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Sugerencias rapidas"
          accessibilityRole="scrollbar"
        >
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[
                styles.suggestionChip,
                { backgroundColor: c.surface, borderColor: c.grayLight },
              ]}
              onPress={() => handleSuggestion(s.label)}
              accessibilityLabel={`Sugerencia: ${s.label}`}
              accessibilityRole="button"
              accessibilityHint="Envia esta pregunta al coach"
              activeOpacity={0.7}
            >
              <Ionicons name={s.icon} size={14} color={c.accent} />
              <Text style={[styles.suggestionText, { color: c.black }]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Input bar ────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.inputContainer,
          {
            paddingHorizontal: sidePadding,
            paddingBottom: Math.max(insets.bottom, spacing.sm),
            borderTopColor: c.border,
            backgroundColor: c.bg,
          },
        ]}
      >
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                backgroundColor: c.surface,
                color: c.black,
                borderColor: inputText.length > 0 ? c.accent + '60' : 'transparent',
              },
            ]}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="Escribe tu pregunta..."
            placeholderTextColor={c.disabled}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => handleSend(inputText)}
            blurOnSubmit={false}
            editable={!loading}
            accessibilityLabel="Campo de mensaje al coach"
            accessibilityHint="Escribe tu pregunta de nutricion aqui"
          />
          <TouchableOpacity
            onPress={() => handleSend(inputText)}
            style={[
              styles.sendBtn,
              {
                backgroundColor: inputText.trim() && !loading ? c.accent : c.surface,
              },
            ]}
            disabled={!inputText.trim() || loading}
            accessibilityLabel="Enviar mensaje al coach"
            accessibilityRole="button"
            accessibilityHint="Envia tu pregunta de nutricion"
            accessibilityState={{ disabled: !inputText.trim() || loading }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="send"
              size={18}
              color={inputText.trim() && !loading ? colors.white : c.disabled}
            />
          </TouchableOpacity>
        </View>

        {/* Character counter — shown only when approaching limit */}
        {inputText.length > 400 && (
          <Text
            style={[styles.charCounter, { color: inputText.length > 480 ? c.protein : c.disabled }]}
            accessibilityLabel={`${500 - inputText.length} caracteres restantes`}
          >
            {500 - inputText.length} restantes
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    zIndex: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    ...typography.titleSm,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 1,
  },

  // Dropdown menu
  dropdownMenu: {
    position: 'absolute',
    top: 68,
    minWidth: 200,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  menuItemText: {
    ...typography.bodyMd,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },

  // Messages list
  messageList: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowCoach: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    overflow: 'hidden',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.xl,
  },
  bubbleUser: {
    borderBottomRightRadius: spacing.xs,
  },
  bubbleCoach: {
    borderBottomLeftRadius: spacing.xs,
  },
  bubbleText: {
    ...typography.body,
    lineHeight: 22,
  },
  timestamp: {
    ...typography.caption,
    fontSize: 10,
    marginTop: spacing.xs,
    textAlign: 'right',
  },

  // Typing indicator bubble
  typingBubble: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },

  // Empty state
  // Note: ListFooterComponent in inverted FlatList renders at the top of the screen.
  // scaleY: -1 counter-rotates text to appear upright.
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
    transform: [{ scaleY: -1 }],
  },
  emptyTitle: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.subtitle,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  errorText: {
    ...typography.caption,
    flex: 1,
  },
  retryBtn: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  retryText: {
    ...typography.label,
  },

  // Suggestions
  suggestionsRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  suggestionText: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Input bar
  inputContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    ...typography.body,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCounter: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginRight: spacing.xs,
  },
});
