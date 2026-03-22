/**
 * CoachScreen — AI Coach Chat
 *
 * Real chat interface powered by the backend AI coach API.
 * Features:
 *   - Bubble-style messages: user (right, accent) + coach (left, surface)
 *   - Auto-loads daily insight on first open (empty history)
 *   - 3 quick-suggestion chips for common questions
 *   - Fitsi mascot avatar on coach messages
 *   - Loading indicator while waiting for response
 *   - Message history persisted via useCoach hook
 *   - Human support fallback link
 *   - Dark mode compatible via theme system
 */
import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useCoach, CoachMessage } from '../../hooks/useCoach';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Quick suggestion chips ─────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Que como de almuerzo?', icon: 'restaurant-outline' as const },
  { label: 'Como voy hoy?', icon: 'trending-up-outline' as const },
  { label: 'Sugiere un snack', icon: 'cafe-outline' as const },
];

// ─── Chat bubble (memoized) ─────────────────────────────────────────────────

const ChatBubble = React.memo(function ChatBubble({
  message,
  c,
}: {
  message: CoachMessage;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.bubbleRow,
        message.isUser ? styles.bubbleRowUser : styles.bubbleRowCoach,
      ]}
    >
      {!message.isUser && (
        <View style={[styles.avatarContainer, { backgroundColor: c.surface }]}>
          <FitsiMascot expression="neutral" size="small" animation="none" disableTouch />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          message.isUser
            ? [styles.bubbleUser, { backgroundColor: c.accent + '20' }]
            : [styles.bubbleCoach, { backgroundColor: c.surface }],
        ]}
        accessibilityLabel={`${message.isUser ? 'Tu' : 'Coach'}: ${message.text}`}
      >
        <Text style={[styles.bubbleText, { color: c.black }]}>
          {message.text}
        </Text>
        <Text style={[styles.timestamp, { color: c.disabled }]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
});

// ─── Typing indicator (memoized) ────────────────────────────────────────────

const TypingIndicator = React.memo(function TypingIndicator({
  c,
}: {
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowCoach]}>
      <View style={[styles.avatarContainer, { backgroundColor: c.surface }]}>
        <FitsiMascot expression="thinking" size="small" animation="thinking" disableTouch />
      </View>
      <View
        style={[
          styles.bubble,
          styles.bubbleCoach,
          styles.typingBubble,
          { backgroundColor: c.surface },
        ]}
      >
        <ActivityIndicator size="small" color={c.gray} />
        <Text style={[styles.typingText, { color: c.gray }]}>Pensando...</Text>
      </View>
    </View>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CoachScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Coach');
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [inputText, setInputText] = React.useState('');
  const insightLoadedRef = useRef(false);

  const {
    messages,
    loading,
    error,
    sendMessage,
    loadInsight,
    dismissError,
  } = useCoach();

  // ── Load daily insight on first open (only if no history) ─────────────────

  useEffect(() => {
    if (insightLoadedRef.current) return;
    insightLoadedRef.current = true;

    // Only auto-load insight if conversation is empty
    if (messages.length === 0) {
      loadInsight();
      track('coach_insight_loaded');
    }
  }, [messages.length, loadInsight, track]);

  // ── Auto-scroll on new messages or loading state ──────────────────────────

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, loading]);

  // ── Send handler ──────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      haptics.light();
      track('coach_message_sent', { message_length: trimmed.length });
      setInputText('');
      await sendMessage(trimmed);
      haptics.light();
    },
    [loading, sendMessage, track],
  );

  // ── Suggestion chip handler ───────────────────────────────────────────────

  const handleSuggestion = useCallback(
    (text: string) => {
      haptics.light();
      track('coach_suggestion_tapped', { suggestion: text });
      handleSend(text);
    },
    [handleSend, track],
  );

  // ── Dismiss error on tap ──────────────────────────────────────────────────

  const handleDismissError = useCallback(() => {
    haptics.light();
    dismissError();
  }, [dismissError]);

  // ── FlatList callbacks (stable refs) ──────────────────────────────────────

  const renderChatItem = useCallback(
    ({ item }: { item: CoachMessage }) => <ChatBubble message={item} c={c} />,
    [c],
  );

  const chatKeyExtractor = useCallback((item: CoachMessage) => item.id, []);

  const handleContentSizeChange = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── Sanitize input on change ──────────────────────────────────────────────

  const handleInputChange = useCallback((t: string) => {
    setInputText(t.replace(/<[^>]*>/g, '').slice(0, 500));
  }, []);

  // ── Determine if suggestions should show ──────────────────────────────────

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { paddingHorizontal: sidePadding, borderBottomColor: c.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={c.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.onlineDot, { backgroundColor: c.success }]} />
            <Text style={[styles.headerTitle, { color: c.black }]}>AI Coach</Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>
            Nutricion personalizada
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={chatKeyExtractor}
        renderItem={renderChatItem}
        contentContainerStyle={[
          styles.messageList,
          { paddingHorizontal: sidePadding },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        bounces={true}
        overScrollMode="never"
        ListFooterComponent={loading ? <TypingIndicator c={c} /> : null}
        onContentSizeChange={handleContentSizeChange}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyContainer}>
              <FitsiMascot expression="happy" size="small" animation="wave" disableTouch />
              <Text style={[styles.emptyText, { color: c.gray }]}>
                Tu coach de nutricion esta listo para ayudarte
              </Text>
            </View>
          )
        }
      />

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: c.surface }]}
          onPress={handleDismissError}
          activeOpacity={0.7}
          accessibilityLabel="Descartar error"
          accessibilityRole="button"
        >
          <Ionicons name="warning-outline" size={16} color={c.protein} />
          <Text style={[styles.errorText, { color: c.protein }]} numberOfLines={2}>
            {error}
          </Text>
          <Ionicons name="close" size={14} color={c.gray} />
        </TouchableOpacity>
      )}

      {/* ── Quick suggestions ──────────────────────────────────────────────── */}
      {showSuggestions && (
        <View style={[styles.suggestionsRow, { paddingHorizontal: sidePadding }]}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[
                styles.suggestionChip,
                { backgroundColor: c.surface, borderColor: c.grayLight },
              ]}
              onPress={() => handleSuggestion(s.label)}
              accessibilityLabel={s.label}
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <Ionicons name={s.icon} size={14} color={c.accent} />
              <Text style={[styles.suggestionText, { color: c.black }]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Human support link ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.humanSupportBtn,
          { borderTopColor: c.border, backgroundColor: c.bg },
        ]}
        onPress={() => {
          haptics.light();
          track('coach_human_support_tapped');
          Linking.openURL('mailto:support@fitsi.app?subject=Soporte%20Fitsi%20App');
        }}
        activeOpacity={0.7}
        accessibilityLabel="Hablar con soporte humano"
        accessibilityRole="button"
      >
        <Ionicons name="headset-outline" size={16} color={c.accent} />
        <Text style={[styles.humanSupportText, { color: c.accent }]}>
          Hablar con soporte humano
        </Text>
      </TouchableOpacity>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
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
            style={[styles.input, { backgroundColor: c.surface, color: c.black }]}
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
            accessibilityLabel="Campo de mensaje"
          />
          <TouchableOpacity
            onPress={() => handleSend(inputText)}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  inputText.trim() && !loading ? c.accent : c.surface,
              },
            ]}
            disabled={!inputText.trim() || loading}
            accessibilityLabel="Enviar mensaje"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color={c.disabled} />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={inputText.trim() ? colors.white : c.disabled}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
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

  // Messages
  messageList: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  bubble: {
    maxWidth: '75%',
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

  // Typing indicator
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typingText: {
    ...typography.caption,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.subtitle,
    textAlign: 'center',
    maxWidth: 240,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  errorText: {
    ...typography.caption,
    flex: 1,
  },

  // Suggestions
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
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

  // Human support
  humanSupportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  humanSupportText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Input
  inputContainer: {
    borderTopWidth: 0,
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
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    ...typography.body,
    maxHeight: 100,
    minHeight: 40,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
