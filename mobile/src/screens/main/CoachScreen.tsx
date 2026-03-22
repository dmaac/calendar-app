/**
 * CoachScreen — AI Coach Chat (mock/local)
 * Chat UI with bubble messages, quick suggestions, and keyword-based responses.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
}

// ─── Mock response engine ────────────────────────────────────────────────────

const TIPS = [
  'Intenta comer al menos 25g de fibra al dia. Frutas, verduras y legumbres son tus aliados.',
  'Hidratate bien: a veces el cuerpo confunde sed con hambre.',
  'Masticar lento te ayuda a sentirte lleno antes. Intenta al menos 20 masticadas por bocado.',
  'Las proteinas te mantienen satisfecho por mas tiempo. Incluye una fuente en cada comida.',
  'Dormir bien es clave para regular la grelina (hormona del hambre). Apunta a 7-8 horas.',
  'Los snacks saludables entre comidas evitan que llegues con hambre excesiva al almuerzo o cena.',
  'Intenta llenar la mitad de tu plato con vegetales en cada comida principal.',
  'Evita comer frente a pantallas: la atencion plena mejora la digestion y la saciedad.',
];

const RECIPES = [
  'Prueba un bowl de quinoa con pollo a la plancha, espinaca, tomate cherry y aderezo de limon. Aprox 450 kcal, alto en proteina.',
  'Wrap integral con atun, palta, lechuga y tomate. Rapido, nutritivo y unas 380 kcal.',
  'Avena overnight: avena + leche de almendras + chia + banana + canela. Perfecta para el desayuno, ~350 kcal.',
  'Ensalada mediterranea: pepino, tomate, aceitunas, queso feta, aceite de oliva. Ligera y deliciosa, ~300 kcal.',
];

const WEEKLY_SUMMARY =
  'Esta semana llevas un promedio de 1,850 kcal/dia. Tu proteina esta en buen rango (130g promedio). Podrias mejorar en carbos complejos — intenta agregar mas legumbres y granos integrales.';

function getCoachResponse(input: string): string {
  const lower = input.toLowerCase();

  // ── Support / help responses (checked first — higher priority) ────────────
  if (lower.includes('cancelar') || lower.includes('suscripcion')) {
    return 'Puedes cancelar tu suscripcion en Settings > Cuenta > Gestion de suscripcion, o directamente en la App Store.';
  }
  if (lower.includes('eliminar') || lower.includes('borrar') || (lower.includes('cuenta') && (lower.includes('delete') || lower.includes('quitar')))) {
    return 'Ve a Settings > Cuenta > Eliminar cuenta. Tus datos se eliminaran en 30 dias segun nuestra politica de privacidad.';
  }
  if (lower.includes('error') || lower.includes('bug') || lower.includes('crash') || lower.includes('falla')) {
    return 'Lamento el inconveniente. Intenta: 1) Cerrar y abrir la app, 2) Actualizar a la ultima version, 3) Contactar soporte si persiste.';
  }
  if (lower.includes('soporte') || lower.includes('problema') || lower.includes('ayuda')) {
    return 'Puedo ayudarte! Para soporte tecnico, ve a Perfil > Settings > Ayuda. Para problemas con cobros, contacta support@fitsi.app';
  }

  // ── Nutrition responses ───────────────────────────────────────────────────
  if (lower.includes('comer') || lower.includes('comida') || lower.includes('receta') || lower.includes('cocinar')) {
    return RECIPES[Math.floor(Math.random() * RECIPES.length)];
  }
  if (lower.includes('semana') || lower.includes('progreso') || lower.includes('resumen') || lower.includes('stats')) {
    return WEEKLY_SUMMARY;
  }
  if (lower.includes('tip') || lower.includes('consejo') || lower.includes('sugerencia')) {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  if (lower.includes('dieta') || lower.includes('plan') || lower.includes('bajar') || lower.includes('peso')) {
    return 'Para bajar de peso de forma saludable, lo ideal es un deficit de 300-500 kcal por dia. Combinalo con actividad fisica y priorizando proteinas para mantener tu masa muscular.';
  }

  return 'Puedo ayudarte con nutricion, recetas, y tu progreso semanal. Preguntame lo que quieras!';
}

// ─── Quick suggestions ───────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Que deberia comer?',
  'Como va mi semana?',
  'Dame un tip',
  'Analiza mi dieta',
];

// ─── Welcome message ─────────────────────────────────────────────────────────

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  text: 'Hola! Soy tu coach de nutricion con IA. Puedo ayudarte con recetas, tips nutricionales y analizar tu progreso. Que necesitas?',
  isUser: false,
  timestamp: Date.now(),
};

// ─── Chat bubble (memoized — each bubble is pure given its message) ──────────

const ChatBubble = React.memo(function ChatBubble({ message, c }: { message: Message; c: ReturnType<typeof useThemeColors> }) {
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
        <Text
          style={[
            styles.bubbleText,
            { color: c.black },
          ]}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
});

// ─── Typing indicator (memoized — props rarely change) ──────────────────────

const TypingIndicator = React.memo(function TypingIndicator({ c }: { c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowCoach]}>
      <View style={[styles.avatarContainer, { backgroundColor: c.surface }]}>
        <FitsiMascot expression="thinking" size="small" animation="thinking" disableTouch />
      </View>
      <View style={[styles.bubble, styles.bubbleCoach, styles.typingBubble, { backgroundColor: c.surface }]}>
        <ActivityIndicator size="small" color={c.gray} />
        <Text style={[styles.typingText, { color: c.gray }]}>Pensando...</Text>
      </View>
    </View>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

export default function CoachScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Coach');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      haptics.light();
      track('coach_message_sent', { message_length: trimmed.length });
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        text: trimmed,
        isUser: true,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setIsTyping(true);

      // Simulate coach "thinking" delay
      const delay = 800 + Math.random() * 1200;
      setTimeout(() => {
        const response = getCoachResponse(trimmed);
        const coachMsg: Message = {
          id: `coach-${Date.now()}`,
          text: response,
          isUser: false,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, coachMsg]);
        setIsTyping(false);
        haptics.light();
      }, delay);
    },
    [isTyping, track],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  // Memoized renderItem to avoid re-creating closure on every render
  const renderChatItem = useCallback(({ item }: { item: Message }) => (
    <ChatBubble message={item} c={c} />
  ), [c]);

  // Stable keyExtractor
  const chatKeyExtractor = useCallback((item: Message) => item.id, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isTyping]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding, borderBottomColor: c.border }]}>
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
          <Text style={[styles.headerTitle, { color: c.black }]}>AI Coach</Text>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>Nutricion personalizada</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Messages */}
      {/* Performance: limited render batch + smaller window to reduce off-screen nodes */}
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
        ListFooterComponent={isTyping ? <TypingIndicator c={c} /> : null}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
      />

      {/* Quick suggestions */}
      {messages.length <= 1 && !isTyping && (
        <View style={[styles.suggestionsRow, { paddingHorizontal: sidePadding }]}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.suggestionChip, { backgroundColor: c.surface, borderColor: c.grayLight }]}
              onPress={() => handleSuggestion(s)}
              accessibilityLabel={s}
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <Text style={[styles.suggestionText, { color: c.black }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Human support button */}
      <TouchableOpacity
        style={[styles.humanSupportBtn, { borderTopColor: c.border, backgroundColor: c.bg }]}
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
        <Text style={[styles.humanSupportText, { color: c.accent }]}>Hablar con soporte humano</Text>
      </TouchableOpacity>

      {/* Input */}
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
            style={[styles.input, { backgroundColor: c.surface, color: c.black }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Escribe tu pregunta..."
            placeholderTextColor={c.disabled}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(inputText)}
            blurOnSubmit={false}
            accessibilityLabel="Campo de mensaje"
          />
          <TouchableOpacity
            onPress={() => sendMessage(inputText)}
            style={[
              styles.sendBtn,
              (!inputText.trim() || isTyping) && { backgroundColor: c.surface },
            ]}
            disabled={!inputText.trim() || isTyping}
            accessibilityLabel="Enviar mensaje"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Ionicons
              name="send"
              size={18}
              color={inputText.trim() && !isTyping ? colors.white : c.disabled}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  headerTitle: {
    ...typography.titleSm,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 1,
  },
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
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typingText: {
    ...typography.caption,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  suggestionText: {
    ...typography.caption,
    fontWeight: '500',
  },
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
