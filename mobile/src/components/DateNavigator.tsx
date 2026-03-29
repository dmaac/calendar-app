/**
 * DateNavigator -- Horizontal day navigation header.
 *
 * Displays: [<] [Hoy / Ayer / Lun 17 Mar] [>]
 * - Arrows to move forward/backward by one day
 * - Tap on center label opens a native date picker
 * - Animated transitions when the date changes (slide + fade)
 * - Cannot navigate into the future (right arrow disabled)
 * - "Hoy" badge appears when viewing a past date (tap to jump back)
 *
 * Designed to integrate with the useDaySwipe hook.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useThemeColors, typography, spacing, radius } from '../theme';

interface DateNavigatorProps {
  /** User-friendly label: "Hoy", "Ayer", "Lun 17 Mar" */
  dateLabel: string;
  /** Subtitle (full date string for Hoy/Ayer, empty string otherwise) */
  dateSubtitle: string;
  /** The currently selected date */
  selectedDate: Date;
  /** Whether the forward arrow should be enabled */
  canGoForward: boolean;
  /** Whether the backward arrow should be enabled */
  canGoBack: boolean;
  /** Whether selectedDate is today */
  isToday: boolean;
  /** Animated translateX for the label transition */
  translateX: Animated.Value;
  /** Animated opacity for the label transition */
  opacity: Animated.Value;
  /** Called when the left arrow is pressed */
  onPreviousDay: () => void;
  /** Called when the right arrow is pressed */
  onNextDay: () => void;
  /** Called when "Hoy" badge or today button is pressed */
  onGoToToday: () => void;
  /** Called when a date is picked from the date picker */
  onDatePicked: (date: Date) => void;
  /** Horizontal padding (matches screen sidePadding) */
  sidePadding?: number;
}

export default function DateNavigator({
  dateLabel,
  dateSubtitle,
  selectedDate,
  canGoForward,
  canGoBack,
  isToday: isTodaySelected,
  translateX,
  opacity,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onDatePicked,
  sidePadding = 24,
}: DateNavigatorProps) {
  const c = useThemeColors();
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const closePicker = useCallback(() => {
    setPickerVisible(false);
  }, []);

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') {
        // Android fires this on both "OK" and "Cancel"
        setPickerVisible(false);
        if (event.type === 'set' && date) {
          onDatePicked(date);
        }
      } else {
        // iOS updates live as the user scrolls the wheel
        if (date) {
          onDatePicked(date);
        }
      }
    },
    [onDatePicked],
  );

  const handleConfirmIOS = useCallback(() => {
    setPickerVisible(false);
  }, []);

  // Max date is today, min date is 90 days ago
  const maxDate = new Date();
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - 90);

  return (
    <>
      <View
        style={[styles.container, { paddingHorizontal: sidePadding }]}
        accessibilityRole="toolbar"
        accessibilityLabel={`Navegacion de dias. Dia seleccionado: ${dateLabel}`}
      >
        {/* Left arrow */}
        <TouchableOpacity
          onPress={onPreviousDay}
          style={[styles.arrowBtn, !canGoBack && styles.arrowBtnDisabled]}
          disabled={!canGoBack}
          accessibilityLabel="Dia anterior"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={canGoBack ? c.black : c.disabled}
          />
        </TouchableOpacity>

        {/* Center date label -- tap to open picker */}
        <TouchableOpacity
          onPress={openPicker}
          style={styles.centerBtn}
          activeOpacity={0.6}
          accessibilityLabel={`${dateLabel}. Toca para abrir el selector de fecha`}
          accessibilityRole="button"
        >
          <Animated.View
            style={[
              styles.centerContent,
              {
                transform: [{ translateX }],
                opacity,
              },
            ]}
          >
            <Text style={[styles.dateLabel, { color: c.black }]} allowFontScaling>{dateLabel}</Text>
            {dateSubtitle !== '' && (
              <Text style={[styles.dateSubtitle, { color: c.gray }]} allowFontScaling>{dateSubtitle}</Text>
            )}
          </Animated.View>
        </TouchableOpacity>

        {/* Right arrow */}
        <TouchableOpacity
          onPress={onNextDay}
          style={[styles.arrowBtn, !canGoForward && styles.arrowBtnDisabled]}
          disabled={!canGoForward}
          accessibilityLabel="Dia siguiente"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={canGoForward ? c.black : c.disabled}
          />
        </TouchableOpacity>

        {/* "Hoy" badge -- only visible when viewing a past date */}
        {!isTodaySelected && (
          <TouchableOpacity
            onPress={onGoToToday}
            style={[styles.todayBadge, { backgroundColor: c.accent }]}
            activeOpacity={0.8}
            accessibilityLabel="Volver a hoy"
            accessibilityRole="button"
          >
            <Text style={[styles.todayBadgeText, { color: c.white }]}>Hoy</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date Picker */}
      {pickerVisible && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          maximumDate={maxDate}
          minimumDate={minDate}
          onChange={handlePickerChange}
        />
      )}

      {pickerVisible && Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="slide"
          visible={pickerVisible}
          onRequestClose={closePicker}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={handleConfirmIOS}
          >
            <View style={[styles.pickerContainer, { backgroundColor: c.bg }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: c.grayLight }]}>
                <TouchableOpacity
                  onPress={closePicker}
                  accessibilityLabel="Cancelar seleccion de fecha"
                  accessibilityRole="button"
                >
                  <Text style={[styles.pickerCancel, { color: c.gray }]} allowFontScaling>Cancelar</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: c.black }]} accessibilityRole="header" allowFontScaling>Seleccionar fecha</Text>
                <TouchableOpacity
                  onPress={handleConfirmIOS}
                  accessibilityLabel="Confirmar fecha seleccionada"
                  accessibilityRole="button"
                >
                  <Text style={[styles.pickerDone, { color: c.accent }]} allowFontScaling>Listo</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                maximumDate={maxDate}
                minimumDate={minDate}
                onChange={handlePickerChange}
                locale="es"
                style={styles.picker}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Web fallback -- simple input[type=date] */}
      {pickerVisible && Platform.OS === 'web' && (
        <Modal
          transparent
          animationType="fade"
          visible={pickerVisible}
          onRequestClose={closePicker}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closePicker}
          >
            <View style={[styles.pickerContainer, { backgroundColor: c.bg }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: c.grayLight }]}>
                <TouchableOpacity onPress={closePicker}>
                  <Text style={[styles.pickerCancel, { color: c.gray }]}>Cerrar</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: c.black }]}>Seleccionar fecha</Text>
                <View style={{ width: 50 }} />
              </View>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                maximumDate={maxDate}
                minimumDate={minDate}
                onChange={handlePickerChange}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: {
    opacity: 0.3,
  },
  centerBtn: {
    flex: 1,
    alignItems: 'center',
  },
  centerContent: {
    alignItems: 'center',
  },
  dateLabel: {
    ...typography.label,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  dateSubtitle: {
    ...typography.caption,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  todayBadge: {
    position: 'absolute',
    right: 68,
    top: -2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  todayBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ---- Date Picker Modal (iOS) ----
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 34,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  pickerCancel: {
    ...typography.bodyMd,
  },
  pickerTitle: {
    ...typography.label,
  },
  pickerDone: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  picker: {
    height: 200,
  },
});
