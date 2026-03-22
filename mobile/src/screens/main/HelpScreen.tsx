/**
 * HelpScreen — In-app help center with FAQ, contact support, and report problem.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── FAQ Data ───────────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: 'Como escaneo una comida?',
    answer: 'Ve a la pestana "Escanear", toma una foto de tu plato y nuestra IA identificara los alimentos y calculara los macronutrientes automaticamente. Tambien puedes subir una foto desde tu galeria.',
  },
  {
    question: 'Que tan preciso es el escaneo de IA?',
    answer: 'Nuestra IA tiene aproximadamente un 90% de precision. La calidad depende de la foto (buena iluminacion, plato completo visible). Siempre puedes editar los valores manualmente si notas alguna diferencia.',
  },
  {
    question: 'Cuantos escaneos gratis tengo?',
    answer: 'Los usuarios gratuitos tienen 3 escaneos por dia. Con Fitsi Premium, tienes escaneos ilimitados mas acceso a recetas personalizadas, reportes detallados y mas.',
  },
  {
    question: 'Como cambio mi objetivo de calorias?',
    answer: 'Ve a Perfil > Settings > Objetivos de nutricion. Ahi puedes ajustar tus metas de calorias diarias, proteinas, carbohidratos y grasas.',
  },
  {
    question: 'Puedo registrar comida manualmente?',
    answer: 'Si! En la pestana "Registro", toca el boton "+" y selecciona "Anadir manualmente" o "Buscar alimento" para encontrarlo en nuestra base de datos.',
  },
  {
    question: 'Como funciona el tracking de agua?',
    answer: 'En la pestana "Registro" veras el tracker de agua. Toca los botones de +250ml para ir sumando. La meta diaria es de 2 litros pero puedes ajustarla en Settings.',
  },
  {
    question: 'Puedo usar la app sin conexion?',
    answer: 'Puedes ver tus datos existentes sin conexion, pero el escaneo de comida requiere internet ya que usa IA en la nube. Los registros manuales se sincronizaran cuando vuelvas a tener conexion.',
  },
  {
    question: 'Como cancelo mi suscripcion?',
    answer: 'Para cancelar, ve a la configuracion de suscripciones de tu telefono: iOS (Settings > tu Apple ID > Suscripciones) o Android (Play Store > Pagos y suscripciones). La app no puede cancelar directamente por politica de las tiendas.',
  },
  {
    question: 'Mis datos estan seguros?',
    answer: 'Si. Usamos encriptacion en transito (TLS) y en reposo. No vendemos tus datos a terceros. Puedes exportar o eliminar todos tus datos en cualquier momento desde Settings > Cuenta.',
  },
  {
    question: 'Como elimino mi cuenta?',
    answer: 'Ve a Perfil > Settings > Cuenta > Eliminar mi cuenta. Esto eliminara permanentemente todos tus datos personales, historial de comidas y fotos en un plazo de 30 dias.',
  },
];

// ─── FAQ Item Component ─────────────────────────────────────────────────────

function FAQRow({
  item,
  isOpen,
  onToggle,
  c,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.faqItem, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={() => { haptics.light(); onToggle(); }}
      activeOpacity={0.7}
      accessibilityLabel={item.question}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
    >
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQuestion, { color: c.black }]}>{item.question}</Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={c.gray}
        />
      </View>
      {isOpen && (
        <Text style={[styles.faqAnswer, { color: c.gray }]}>{item.answer}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function HelpScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportText, setReportText] = useState('');

  const toggleFaq = useCallback((idx: number) => {
    setOpenFaq((prev) => (prev === idx ? null : idx));
  }, []);

  const handleContactSupport = useCallback(() => {
    haptics.light();
    Linking.openURL('mailto:soporte@fitsi.app?subject=Soporte%20Fitsi%20IA');
  }, []);

  const handleHelpCenter = useCallback(() => {
    haptics.light();
    Linking.openURL('https://help.fitsi.app');
  }, []);

  const handleSubmitReport = useCallback(() => {
    if (!reportText.trim()) {
      Alert.alert('Campo vacio', 'Describe el problema antes de enviar.');
      return;
    }
    haptics.success();
    Alert.alert(
      'Reporte enviado',
      'Gracias por reportar este problema. Nuestro equipo lo revisara en menos de 24 horas.',
      [{ text: 'OK', onPress: () => { setReportText(''); setShowReportForm(false); } }],
    );
  }, [reportText]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Ayuda</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Fitsi greeting */}
        <View style={styles.mascotRow}>
          <FitsiMascot expression="doctor" size="small" animation="idle" />
          <View style={styles.mascotBubble}>
            <Text style={[styles.mascotText, { color: c.black, backgroundColor: c.surface }]}>
              En que puedo ayudarte?
            </Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
            onPress={handleContactSupport}
            activeOpacity={0.7}
            accessibilityLabel="Contactar soporte por email"
            accessibilityRole="button"
          >
            <Ionicons name="mail-outline" size={24} color={c.accent} />
            <Text style={[styles.actionLabel, { color: c.black }]}>Contactar{'\n'}soporte</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
            onPress={handleHelpCenter}
            activeOpacity={0.7}
            accessibilityLabel="Abrir centro de ayuda web"
            accessibilityRole="button"
          >
            <Ionicons name="globe-outline" size={24} color={c.accent} />
            <Text style={[styles.actionLabel, { color: c.black }]}>Centro de{'\n'}ayuda</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
            onPress={() => { haptics.light(); setShowReportForm(!showReportForm); }}
            activeOpacity={0.7}
            accessibilityLabel="Reportar un problema"
            accessibilityRole="button"
          >
            <Ionicons name="bug-outline" size={24} color={c.accent} />
            <Text style={[styles.actionLabel, { color: c.black }]}>Reportar{'\n'}problema</Text>
          </TouchableOpacity>
        </View>

        {/* Report form */}
        {showReportForm && (
          <View style={[styles.reportForm, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Text style={[styles.reportTitle, { color: c.black }]}>Describe el problema</Text>
            <TextInput
              style={[styles.reportInput, { color: c.black, backgroundColor: c.bg, borderColor: c.grayLight }]}
              placeholder="Que paso? Cuando? Que esperabas que pasara?"
              placeholderTextColor={c.disabled}
              value={reportText}
              onChangeText={setReportText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel="Descripcion del problema"
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: c.black }]}
              onPress={handleSubmitReport}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={16} color={c.white} />
              <Text style={[styles.submitText, { color: c.white }]}>Enviar reporte</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* FAQ Section */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Preguntas frecuentes</Text>

        {FAQ_DATA.map((item, idx) => (
          <FAQRow
            key={idx}
            item={item}
            isOpen={openFaq === idx}
            onToggle={() => toggleFaq(idx)}
            c={c}
          />
        ))}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: { paddingTop: spacing.xs },
  mascotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  mascotBubble: { flex: 1 },
  mascotText: {
    ...typography.bodyMd,
    padding: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    ...shadows.sm,
  },
  actionLabel: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  reportForm: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  reportTitle: { ...typography.label },
  reportInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 100,
    ...typography.body,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
  },
  submitText: { ...typography.label },
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },
  faqItem: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  faqQuestion: {
    ...typography.bodyMd,
    flex: 1,
  },
  faqAnswer: {
    ...typography.caption,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
