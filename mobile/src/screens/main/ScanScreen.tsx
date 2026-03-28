/**
 * ScanScreen — AI Food Scanning (core feature)
 *
 * Flow: idle (camera/gallery) -> permission check -> network check ->
 *       scanning (with elapsed timer + cancel) -> result (edit inline) -> confirm -> logged
 *
 * Improvements over previous version:
 * - Proper camera permission handling with "Open Settings" when permanently denied
 * - Network connectivity check before scanning (avoids wasted wait on no connection)
 * - Categorized error messages (network, timeout, camera, generic AI)
 * - Elapsed timer during scan so user knows it is working
 * - Cancel button during scan
 * - Separate retry options: "retry same image" vs "try different photo"
 * - Fade-out/fade-in transitions between states using Animated
 * - Daily calorie context in result view (shows how meal fits into goal)
 * - Improved accessibility: live regions, roles, hints on every interactive element
 * - Haptic feedback on every meaningful interaction
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Image,
  Animated,
  Easing,
  TextInput,
  Linking,
  AccessibilityInfo,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import * as foodService from '../../services/food.service';
import { FoodScanResult } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { haptics } from '../../hooks/useHaptics';
import usePulse from '../../hooks/usePulse';
import { useAnalytics } from '../../hooks/useAnalytics';
import SuccessCheckmark from '../../components/SuccessCheckmark';
import HealthScore from '../../components/HealthScore';
import FitsiMascot from '../../components/FitsiMascot';
import ErrorFallback from '../../components/ErrorFallback';
import { cacheScanResult, markScanSynced, cleanOldScans } from '../../services/scanCache.service';
import * as favoritesService from '../../services/favorites.service';
import { showNotification } from '../../components/InAppNotification';

const FREE_SCAN_LIMIT = 3;

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ScanState = 'idle' | 'scanning' | 'result' | 'error' | 'logged';
type ErrorType = 'network' | 'timeout' | 'camera' | 'generic';

const MEAL_TYPES: { value: MealType; labelKey: string; icon: string; color: string }[] = [
  { value: 'breakfast', labelKey: 'scan.breakfast', icon: 'sunny-outline',      color: '#F59E0B' },
  { value: 'lunch',     labelKey: 'scan.lunch',     icon: 'restaurant-outline',  color: '#10B981' },
  { value: 'dinner',    labelKey: 'scan.dinner',    icon: 'moon-outline',        color: '#6366F1' },
  { value: 'snack',     labelKey: 'scan.snack',     icon: 'cafe-outline',        color: '#EC4899' },
];

/** Compute a basic health score (1-10) from macro balance.
 *  Ideal ratio: ~30% protein, ~40% carbs, ~30% fat by calories. */
function computeHealthScore(calories: number, proteinG: number, carbsG: number, fatG: number): number {
  if (calories <= 0) return 5;
  const pCal = proteinG * 4;
  const cCal = carbsG * 4;
  const fCal = fatG * 9;
  const total = pCal + cCal + fCal || 1;
  const pRatio = pCal / total;
  const cRatio = cCal / total;
  const fRatio = fCal / total;
  const dist = Math.abs(pRatio - 0.3) + Math.abs(cRatio - 0.4) + Math.abs(fRatio - 0.3);
  const raw = 10 - dist * 10;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

/** Classify an error into a user-friendly category. */
function classifyError(err: any): ErrorType {
  if (!err) return 'generic';

  // Timeout errors
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) return 'timeout';

  // Network errors (no connectivity, DNS failure, etc)
  if (
    err.code === 'ERR_NETWORK' ||
    err.message?.includes('Network Error') ||
    err.message?.includes('Failed to fetch') ||
    !err.response
  ) return 'network';

  // Camera-specific errors
  if (err.message?.includes('camera') || err.message?.includes('Camera')) return 'camera';

  return 'generic';
}

// ---- Macro pill ----
function MacroPill({
  label,
  value,
  unit,
  color,
  grayColor,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  grayColor: string;
}) {
  return (
    <View
      style={[styles.macroPill, { borderColor: color + '40', backgroundColor: color + '10' }]}
      accessibilityLabel={`${label}: ${Math.round(value)} ${unit}`}
    >
      <Text style={[styles.macroPillValue, { color }]}>{Math.round(value)}{unit}</Text>
      <Text style={[styles.macroPillLabel, { color: grayColor }]}>{label}</Text>
    </View>
  );
}

// ---- Daily progress bar ----
function DailyProgressBar({
  currentCal,
  goalCal,
  mealCal,
  accentColor,
  grayColor,
  surfaceColor,
  t,
}: {
  currentCal: number;
  goalCal: number;
  mealCal: number;
  accentColor: string;
  grayColor: string;
  surfaceColor: string;
  t: (key: string, opts?: Record<string, any>) => string;
}) {
  const totalAfter = currentCal + mealCal;
  const progress = Math.min(totalAfter / (goalCal || 1), 1);
  const isOver = totalAfter > goalCal;

  return (
    <View
      style={[styles.dailyProgressContainer, { backgroundColor: surfaceColor }]}
      accessibilityLabel={t(isOver ? 'scan.overDailyGoal' : 'scan.fitsInYourDay')}
    >
      <View style={styles.dailyProgressHeader}>
        <Ionicons
          name={isOver ? 'warning-outline' : 'checkmark-circle-outline'}
          size={14}
          color={isOver ? '#F59E0B' : '#34A853'}
        />
        <Text style={[styles.dailyProgressHint, { color: grayColor }]}>
          {t(isOver ? 'scan.overDailyGoal' : 'scan.fitsInYourDay')}
        </Text>
      </View>
      <View style={[styles.dailyProgressTrack, { backgroundColor: grayColor + '20' }]}>
        {/* Existing progress (before this meal) */}
        <View
          style={[
            styles.dailyProgressFill,
            {
              width: `${Math.min((currentCal / (goalCal || 1)) * 100, 100)}%`,
              backgroundColor: accentColor + '60',
            },
          ]}
        />
        {/* This meal's contribution */}
        <View
          style={[
            styles.dailyProgressMealFill,
            {
              width: `${Math.min((mealCal / (goalCal || 1)) * 100, 100 - Math.min((currentCal / (goalCal || 1)) * 100, 100))}%`,
              backgroundColor: isOver ? '#F59E0B' : accentColor,
              left: `${Math.min((currentCal / (goalCal || 1)) * 100, 100)}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.dailyProgressText, { color: grayColor }]}>
        {t('scan.dailyProgress', { current: Math.round(totalAfter), goal: Math.round(goalCal) })}
      </Text>
    </View>
  );
}

// ---- Scanning animation -- rotates through analysis steps ----
const SCAN_ANALYSIS_STEPS_KEYS = [
  { icon: 'eye-outline', key: 'scan.identifying' },
  { icon: 'nutrition-outline', key: 'scan.calculatingNutrients' },
  { icon: 'analytics-outline', key: 'scan.estimatingPortions' },
  { icon: 'checkmark-circle-outline', key: 'scan.verifyingResults' },
];

function ScanningAnimation({
  shimmerOpacity,
  elapsedSeconds,
  onCancel,
  t,
}: {
  shimmerOpacity: Animated.Value;
  elapsedSeconds: number;
  onCancel: () => void;
  t: (key: string, opts?: Record<string, any>) => string;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const textOpacity = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(ringScale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();

    const interval = setInterval(() => {
      Animated.timing(textOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStepIdx((prev) => (prev + 1) % SCAN_ANALYSIS_STEPS_KEYS.length);
        Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 2200);

    return () => {
      pulse.stop();
      spin.stop();
      clearInterval(interval);
    };
  }, []);

  const currentStep = SCAN_ANALYSIS_STEPS_KEYS[stepIdx];

  return (
    <View style={scanAnimStyles.container}>
      {/* Pulsing ring */}
      <Animated.View style={[scanAnimStyles.ring, { transform: [{ scale: ringScale }] }]} />
      {/* Spinner */}
      <Animated.View
        style={[
          scanAnimStyles.spinner,
          {
            transform: [{
              rotate: spinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              }),
            }],
          },
        ]}
      />
      {/* Rotating step text */}
      <Animated.View style={[scanAnimStyles.textRow, { opacity: textOpacity }]}>
        <Ionicons name={currentStep.icon as any} size={16} color="#FFFFFF" />
        <Text style={scanAnimStyles.stepText}>{t(currentStep.key)}</Text>
      </Animated.View>
      <Animated.Text style={[scanAnimStyles.hint, { opacity: shimmerOpacity }]}>
        {t('scan.analyzingYourFood')}
      </Animated.Text>

      {/* Elapsed timer */}
      <View style={scanAnimStyles.timerRow}>
        <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
        <Text style={scanAnimStyles.timerText}>
          {t('scan.elapsedTime', { seconds: elapsedSeconds })}
        </Text>
      </View>

      {/* Cancel button */}
      <TouchableOpacity
        style={scanAnimStyles.cancelBtn}
        onPress={onCancel}
        activeOpacity={0.7}
        accessibilityLabel={t('scan.cancelScan')}
        accessibilityRole="button"
      >
        <Ionicons name="close-circle-outline" size={16} color="rgba(255,255,255,0.8)" />
        <Text style={scanAnimStyles.cancelText}>{t('scan.cancelScan')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const scanAnimStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderTopColor: 'transparent',
    marginBottom: spacing.sm,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepText: { ...typography.titleSm, color: '#FFFFFF' },
  hint: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  timerText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    fontVariant: ['tabular-nums'],
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    minHeight: 40,
  },
  cancelText: {
    ...typography.label,
    color: 'rgba(255,255,255,0.8)',
  },
});

// ---- Main screen ----
export default function ScanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const { isPremium } = useAuth();
  const c = useThemeColors();
  const { t } = useTranslation();
  const { track } = useAnalytics('Scan');
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResult | null>(null);
  const [todayScans, setTodayScans] = useState(0);
  const [scansLoading, setScansLoading] = useState(false);
  const [scansError, setScansError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorHint, setErrorHint] = useState('');
  const [errorType, setErrorType] = useState<ErrorType>('generic');
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    food_name: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fats_g: '',
  });
  const [isFavorited, setIsFavorited] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [dailyCalories, setDailyCalories] = useState<{ current: number; goal: number } | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanAbortRef = useRef(false);

  // Transition opacity for smooth state changes
  const stateOpacity = useRef(new Animated.Value(1)).current;

  // Check if scanned food is already a favorite
  useEffect(() => {
    if (result?.food_name) {
      favoritesService.isFavorite(result.food_name).then(setIsFavorited).catch(() => {});
    }
  }, [result?.food_name]);

  // Load daily calories context for progress bar in result view
  useEffect(() => {
    if (scanState === 'idle') {
      foodService.getDailySummary().then((summary) => {
        if (summary && typeof summary.total_calories === 'number') {
          setDailyCalories({
            current: summary.total_calories,
            goal: summary.target_calories ?? 2000,
          });
        }
      }).catch(() => {
        // Best-effort - do not block the scan flow
      });
    }
  }, [scanState]);

  const handleToggleFavorite = useCallback(async () => {
    if (!result) return;
    haptics.light();
    const added = await favoritesService.toggleFavorite({
      name: result.food_name,
      calories: result.calories,
      protein_g: result.protein_g,
      carbs_g: result.carbs_g,
      fats_g: result.fats_g,
    });
    setIsFavorited(added);
    showNotification({
      message: added ? `${result.food_name} agregado a favoritos!` : `${result.food_name} eliminado de favoritos`,
      type: added ? 'success' : 'info',
      icon: added ? 'heart' : 'heart-dislike',
    });
  }, [result]);

  // Scale animation for result card
  const resultScale = useRef(new Animated.Value(0.92)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // Pulse animation on camera circle in idle state
  const cameraCirclePulse = usePulse({ active: scanState === 'idle', duration: 2200, maxScale: 1.06 });

  // Scanning state shimmer
  const scanShimmer = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (scanState === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanShimmer, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(scanShimmer, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [scanState]);

  // Elapsed timer during scanning
  useEffect(() => {
    if (scanState === 'scanning') {
      setElapsedSeconds(0);
      elapsedRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
      };
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
  }, [scanState]);

  // Cleanup timer on unmount + prune old cached scans
  useEffect(() => {
    cleanOldScans().catch(() => {});
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  // Animate result card entrance
  useEffect(() => {
    if (scanState === 'result') {
      haptics.success();
      resultScale.setValue(0.92);
      resultOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(resultOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [scanState]);

  // Load scan count for free users
  React.useEffect(() => {
    if (!isPremium && scanState === 'idle') {
      setScansLoading(true);
      setScansError(false);
      foodService.getFoodLogs().then((logs) => {
        const aiScans = logs.filter((l) => l.ai_confidence !== null && l.ai_confidence < 1.0);
        setTodayScans(aiScans.length);
      }).catch(() => {
        setScansError(true);
        setTodayScans(0);
      }).finally(() => {
        setScansLoading(false);
      });
    }
  }, [isPremium, scanState]);

  // ---- Permission handling with "Open Settings" support ----
  const requestPermission = async (type: 'camera' | 'library'): Promise<'granted' | 'denied' | 'blocked'> => {
    if (Platform.OS === 'web') return 'granted';

    if (type === 'camera') {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (status === 'granted') return 'granted';
      return canAskAgain ? 'denied' : 'blocked';
    } else {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status === 'granted') return 'granted';
      return canAskAgain ? 'denied' : 'blocked';
    }
  };

  const showPermissionBlockedAlert = (type: 'camera' | 'library') => {
    const message = type === 'camera'
      ? t('scan.cameraPermissionSettings')
      : t('scan.galleryPermissionSettings');

    Alert.alert(
      t('scan.permissionDenied'),
      message,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('scan.openSettings'),
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          },
        },
      ],
    );
  };

  // ---- Network connectivity check ----
  const checkNetwork = async (): Promise<boolean> => {
    try {
      const state = await Network.getNetworkStateAsync();
      return state.isConnected === true && state.isInternetReachable !== false;
    } catch {
      // If check fails, allow the scan to proceed (optimistic)
      return true;
    }
  };

  // ---- Smooth state transition ----
  const transitionTo = useCallback((nextState: ScanState) => {
    Animated.timing(stateOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setScanState(nextState);
      Animated.timing(stateOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [stateOpacity]);

  const pickImage = async (source: 'camera' | 'library') => {
    haptics.light();

    const permissionResult = await requestPermission(source);

    if (permissionResult === 'blocked') {
      showPermissionBlockedAlert(source);
      track('permission_blocked', { type: source });
      return;
    }

    if (permissionResult === 'denied') {
      Alert.alert(
        t('scan.permissionDenied'),
        source === 'camera' ? t('scan.cameraPermission') : t('scan.galleryPermission'),
      );
      track('permission_denied', { type: source });
      return;
    }

    // Check network before proceeding
    const hasNetwork = await checkNetwork();
    if (!hasNetwork) {
      haptics.error();
      setErrorMsg(t('scan.noConnection'));
      setErrorHint(t('scan.noConnectionHint'));
      setErrorType('network');
      transitionTo('error');
      track('scan_no_network');
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      exif: false,
    };

    try {
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (res.canceled || !res.assets?.[0]) return;

      const uri = res.assets[0].uri;
      setImageUri(uri);
      await scanImage(uri);
    } catch (err: any) {
      haptics.error();
      setErrorMsg(t('scan.cameraError'));
      setErrorHint(t('scan.cameraErrorHint'));
      setErrorType('camera');
      transitionTo('error');
      track('camera_error', { error: err?.message });
    }
  };

  const scanImage = async (uri: string) => {
    scanAbortRef.current = false;
    transitionTo('scanning');

    try {
      const data = await foodService.scanFood(uri, selectedMeal);

      // If user cancelled during the scan, discard result
      if (scanAbortRef.current) {
        setScanState('idle');
        return;
      }

      setResult(data);
      setIsEditing(false);
      setEditValues({
        food_name: data.food_name,
        calories: String(Math.round(data.calories)),
        protein_g: String(Math.round(data.protein_g)),
        carbs_g: String(Math.round(data.carbs_g)),
        fats_g: String(Math.round(data.fats_g)),
      });
      transitionTo('result');

      // Announce result to screen readers
      AccessibilityInfo.announceForAccessibility(
        `${data.food_name}, ${Math.round(data.calories)} kcal`
      );

      track('food_scanned', {
        meal_type: selectedMeal,
        confidence: data.ai_confidence,
        food_name: data.food_name,
        elapsed_seconds: elapsedSeconds,
      });

      // Cache scan result locally for offline access
      cacheScanResult({
        id: String(data.id),
        imageUri: uri,
        result: {
          food_name: data.food_name,
          calories: data.calories,
          protein_g: data.protein_g,
          carbs_g: data.carbs_g,
          fats_g: data.fats_g,
          confidence: data.ai_confidence,
          ai_provider: data.ai_provider ?? 'unknown',
        },
        timestamp: new Date().toISOString(),
        synced: true,
      }).catch(() => {});
    } catch (err: any) {
      if (scanAbortRef.current) {
        setScanState('idle');
        return;
      }

      haptics.error();
      const type = classifyError(err);
      setErrorType(type);

      switch (type) {
        case 'network':
          setErrorMsg(t('scan.networkError'));
          setErrorHint(t('scan.networkErrorHint'));
          break;
        case 'timeout':
          setErrorMsg(t('scan.timeoutError'));
          setErrorHint(t('scan.timeoutErrorHint'));
          break;
        case 'camera':
          setErrorMsg(t('scan.cameraError'));
          setErrorHint(t('scan.cameraErrorHint'));
          break;
        default: {
          const serverMsg = err?.response?.data?.detail;
          setErrorMsg(serverMsg || t('scan.couldNotAnalyze'));
          setErrorHint(t('scan.networkErrorHint'));
          break;
        }
      }

      transitionTo('error');
      track('scan_error', { type, elapsed_seconds: elapsedSeconds, message: err?.message });
    }
  };

  const handleCancelScan = useCallback(() => {
    haptics.light();
    scanAbortRef.current = true;
    setScanState('idle');
    setImageUri(null);
    track('scan_cancelled', { elapsed_seconds: elapsedSeconds });
  }, [elapsedSeconds]);

  const handleConfirm = async () => {
    haptics.medium();
    // If user edited macros, persist edits to backend before confirming
    if (isEditing && result) {
      try {
        await foodService.editFoodLog(result.id, {
          food_name: editValues.food_name,
          calories: Number(editValues.calories) || 0,
          protein_g: Number(editValues.protein_g) || 0,
          carbs_g: Number(editValues.carbs_g) || 0,
          fats_g: Number(editValues.fats_g) || 0,
        });
      } catch {
        // Best-effort save -- log was already created by the backend scan
      }
    }
    track('food_logged_from_scan', {
      meal_type: selectedMeal,
      food_name: isEditing ? editValues.food_name : result?.food_name,
      calories: isEditing ? Number(editValues.calories) : result?.calories,
      was_edited: isEditing,
    });
    transitionTo('logged');
    // Navigate to log after a moment
    confirmTimerRef.current = setTimeout(() => {
      setScanState('idle');
      setImageUri(null);
      setResult(null);
      setIsEditing(false);
      navigation.navigate('Registro');
    }, 2200);
  };

  const handleToggleEdit = () => {
    if (!result) return;
    haptics.light();
    if (!isEditing) {
      track('edit_macros_from_scan', { food_name: result.food_name });
      setEditValues({
        food_name: result.food_name,
        calories: String(Math.round(result.calories)),
        protein_g: String(Math.round(result.protein_g)),
        carbs_g: String(Math.round(result.carbs_g)),
        fats_g: String(Math.round(result.fats_g)),
      });
    }
    setIsEditing(!isEditing);
  };

  const handleRetry = () => {
    haptics.light();
    setScanState('idle');
    setImageUri(null);
    setResult(null);
    setIsEditing(false);
    setErrorMsg('');
    setErrorHint('');
  };

  const handleRetryFromError = () => {
    haptics.light();
    if (imageUri) {
      scanImage(imageUri);
    } else {
      handleRetry();
    }
  };

  // ---- Result view ----
  if (scanState === 'result' && result) {
    const confidence = Math.round((result.ai_confidence ?? 0) * 100);
    const displayName = isEditing ? editValues.food_name : result.food_name;
    const displayCal = isEditing ? Number(editValues.calories) || 0 : result.calories;
    const displayProtein = isEditing ? Number(editValues.protein_g) || 0 : result.protein_g;
    const displayCarbs = isEditing ? Number(editValues.carbs_g) || 0 : result.carbs_g;
    const displayFats = isEditing ? Number(editValues.fats_g) || 0 : result.fats_g;

    return (
      <Animated.View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg, opacity: stateOpacity }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Image thumbnail + food name row */}
          <View style={styles.resultTopRow}>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={styles.resultThumbnail}
                resizeMode="cover"
                accessibilityLabel="Foto del alimento escaneado"
                accessibilityRole="image"
              />
            )}
            <View style={{ flex: 1 }}>
              {isEditing ? (
                <TextInput
                  style={[styles.editNameInput, { color: c.black, borderColor: c.accent, backgroundColor: c.surface }]}
                  value={editValues.food_name}
                  onChangeText={(v) => setEditValues((p) => ({ ...p, food_name: v }))}
                  accessibilityLabel="Nombre del alimento"
                  accessibilityHint={t('scan.editHint')}
                  autoFocus
                />
              ) : (
                <Text style={[styles.resultFood, { color: c.black }]}>{result.food_name}</Text>
              )}
              <Text style={[styles.resultConfidence, { color: c.gray }]}>
                {t('scan.confidence', { value: confidence })}
              </Text>
            </View>
            {result.cache_hit && (
              <View
                style={[styles.cacheBadge, { backgroundColor: c.badgeBg }]}
                accessibilityLabel="Resultado obtenido de cache"
              >
                <Ionicons name="flash" size={12} color="#F59E0B" />
                <Text style={[styles.cacheBadgeText, { color: c.badgeText }]}>Cache</Text>
              </View>
            )}
          </View>

          {/* AI Provider badge */}
          {result.ai_provider && (
            <View
              style={[
                styles.aiProviderBadge,
                {
                  backgroundColor:
                    result.ai_provider === 'claude' ? '#7C3AED15' :
                    result.ai_provider === 'openai' ? '#10B98115' :
                    c.surface,
                },
              ]}
              accessibilityLabel={`Analizado por ${
                result.ai_provider === 'claude' ? 'Claude AI' :
                result.ai_provider === 'openai' ? 'GPT-4o' :
                'Demo'
              }`}
            >
              <Ionicons
                name={
                  result.ai_provider === 'claude' ? 'sparkles' :
                  result.ai_provider === 'openai' ? 'flash' :
                  'code-working-outline'
                }
                size={13}
                color={
                  result.ai_provider === 'claude' ? '#7C3AED' :
                  result.ai_provider === 'openai' ? '#10B981' :
                  c.gray
                }
              />
              <Text
                style={[
                  styles.aiProviderBadgeText,
                  {
                    color:
                      result.ai_provider === 'claude' ? '#7C3AED' :
                      result.ai_provider === 'openai' ? '#10B981' :
                      c.gray,
                  },
                ]}
              >
                {result.ai_provider === 'claude' ? 'Claude AI' :
                 result.ai_provider === 'openai' ? 'GPT-4o' :
                 'Demo'}
              </Text>
            </View>
          )}

          {/* Result card -- animated scale entrance */}
          <Animated.View
            style={[
              styles.resultCard,
              { backgroundColor: c.surface, borderColor: c.grayLight, transform: [{ scale: resultScale }], opacity: resultOpacity },
            ]}
            accessibilityLabel={`Resultado: ${displayName}, ${Math.round(displayCal)} kcal`}
            accessibilityLiveRegion="polite"
          >
            {/* Main calories */}
            {isEditing ? (
              <View style={styles.editCalorieRow}>
                <TextInput
                  style={[styles.editCalorieInput, { color: c.black, borderColor: c.accent, backgroundColor: c.bg }]}
                  value={editValues.calories}
                  onChangeText={(v) => setEditValues((p) => ({ ...p, calories: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  accessibilityLabel="Calorias"
                  accessibilityHint={t('scan.editHint')}
                  selectTextOnFocus
                />
                <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
              </View>
            ) : (
              <View style={styles.calorieBox}>
                <Text style={[styles.calorieValue, { color: c.black }]}>{Math.round(result.calories)}</Text>
                <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
                {result.serving_size && (
                  <Text style={[styles.servingSize, { color: c.gray }]}>por {result.serving_size}</Text>
                )}
              </View>
            )}

            {/* Macros -- editable or display */}
            {isEditing ? (
              <View style={styles.macroRow}>
                {([
                  { key: 'protein_g' as const, label: 'Proteina', color: c.protein },
                  { key: 'carbs_g' as const, label: 'Carbos', color: c.carbs },
                  { key: 'fats_g' as const, label: 'Grasas', color: c.fats },
                ] as const).map((m) => (
                  <View
                    key={m.key}
                    style={[styles.macroPill, { borderColor: m.color + '40', backgroundColor: m.color + '10' }]}
                  >
                    <TextInput
                      style={[styles.editMacroInput, { color: m.color }]}
                      value={editValues[m.key]}
                      onChangeText={(v) => setEditValues((p) => ({ ...p, [m.key]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      accessibilityLabel={m.label}
                      accessibilityHint={t('scan.editHint')}
                      selectTextOnFocus
                    />
                    <Text style={[styles.macroPillLabel, { color: c.gray }]}>{m.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.macroRow}>
                <MacroPill label="Proteina" value={result.protein_g}  unit="g" color={c.protein} grayColor={c.gray} />
                <MacroPill label="Carbos"   value={result.carbs_g}    unit="g" color={c.carbs}   grayColor={c.gray} />
                <MacroPill label="Grasas"   value={result.fats_g}     unit="g" color={c.fats}    grayColor={c.gray} />
              </View>
            )}

            {/* Health Score */}
            <HealthScore
              score={computeHealthScore(displayCal, displayProtein, displayCarbs, displayFats)}
              size="small"
            />

            {!isEditing && (result.fiber_g != null || result.sodium_mg != null) && (
              <View style={styles.extraRow}>
                {result.fiber_g != null && (
                  <Text style={[styles.extraItem, { color: c.gray }]}>Fibra: {result.fiber_g}g</Text>
                )}
                {result.sodium_mg != null && (
                  <Text style={[styles.extraItem, { color: c.gray }]}>Sodio: {result.sodium_mg}mg</Text>
                )}
              </View>
            )}

            {/* Meal type pill */}
            {(() => {
              const mt = MEAL_TYPES.find(m => m.value === selectedMeal)!;
              return (
                <View
                  style={[styles.mealBadge, { backgroundColor: mt.color + '15' }]}
                  accessibilityLabel={`Tipo de comida: ${t(mt.labelKey)}`}
                >
                  <Ionicons name={mt.icon as any} size={14} color={mt.color} />
                  <Text style={[styles.mealBadgeText, { color: mt.color }]}>{t(mt.labelKey)}</Text>
                </View>
              );
            })()}
          </Animated.View>

          {/* Daily progress bar -- shows how this meal fits into goal */}
          {dailyCalories && !isEditing && (
            <DailyProgressBar
              currentCal={dailyCalories.current}
              goalCal={dailyCalories.goal}
              mealCal={displayCal}
              accentColor={c.accent}
              grayColor={c.gray}
              surfaceColor={c.surface}
              t={t}
            />
          )}

          {/* High calorie tip */}
          {displayCal > 800 && (
            <View
              style={[styles.highCalorieTip, { backgroundColor: c.surface, borderColor: c.grayLight }]}
              accessibilityLabel={`Tip: Esta comida tiene ${Math.round(displayCal)} calorias, lo cual es bastante. Considera una porcion mas pequena.`}
            >
              <Ionicons name="information-circle-outline" size={16} color={c.gray} />
              <Text style={[styles.highCalorieTipText, { color: c.gray }]}>
                Tip: Esta comida tiene muchas calorias. Considera una porcion mas pequena.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: c.black, flex: 1 }]}
              onPress={handleConfirm}
              activeOpacity={0.85}
              accessibilityLabel={isEditing ? t('scan.saveChanges') : t('scan.saveToLog')}
              accessibilityRole="button"
              accessibilityHint="Confirma y guarda este alimento en tu diario"
            >
              <Ionicons name="checkmark-circle" size={20} color={c.white} />
              <Text style={[styles.confirmBtnText, { color: c.white }]}>
                {isEditing ? t('scan.saveChanges') : t('scan.saveToLog')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: isFavorited ? '#EF4444' : c.surface, width: 52 }]}
              onPress={handleToggleFavorite}
              activeOpacity={0.7}
              accessibilityLabel={isFavorited ? 'Eliminar de favoritos' : 'Agregar a favoritos'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isFavorited ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorited ? c.white : '#EF4444'}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.editMacrosBtn, { backgroundColor: isEditing ? c.accent + '15' : c.surface, borderColor: c.accent + '30' }]}
            onPress={handleToggleEdit}
            activeOpacity={0.7}
            accessibilityLabel={isEditing ? t('scan.cancelEdit') : t('scan.editMacros')}
            accessibilityRole="button"
            accessibilityHint={isEditing ? '' : t('scan.editHint')}
          >
            <Ionicons name={isEditing ? 'close-outline' : 'create-outline'} size={18} color={c.accent} />
            <Text style={[styles.editMacrosBtnText, { color: c.accent }]}>
              {isEditing ? t('scan.cancelEdit') : t('scan.editMacros')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.surface }]}
            onPress={handleRetry}
            activeOpacity={0.7}
            accessibilityLabel={t('scan.scanAnother')}
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={c.black} />
            <Text style={[styles.retryBtnText, { color: c.black }]}>{t('scan.scanAnother')}</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ---- Logged confirmation -- Fitsi party + confetti ----
  if (scanState === 'logged') {
    return (
      <Animated.View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg, opacity: stateOpacity }]}
        accessibilityLabel="Comida registrada exitosamente. Redirigiendo a tu registro."
      >
        <FitsiMascot expression="party" size="large" animation="bounce" />
        <SuccessCheckmark size={64} showParticles={true} />
        <Text style={[styles.successText, { color: c.black }]}>{t('scan.logged')}</Text>
        <Text style={[styles.successHint, { color: c.gray }]}>{t('scan.redirecting')}</Text>
      </Animated.View>
    );
  }

  // ---- Scanning loader -- multi-step analysis animation ----
  if (scanState === 'scanning') {
    return (
      <Animated.View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, backgroundColor: c.bg, opacity: stateOpacity }]}
        accessibilityLabel="Analizando imagen con inteligencia artificial. Esto puede tardar hasta 60 segundos."
        accessibilityLiveRegion="polite"
      >
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.scanningPreview}
            resizeMode="cover"
            accessibilityElementsHidden
          />
        )}
        <View style={styles.scanningOverlay}>
          <ScanningAnimation
            shimmerOpacity={scanShimmer}
            elapsedSeconds={elapsedSeconds}
            onCancel={handleCancelScan}
            t={t}
          />
          {/* Shimmer skeleton preview of result card */}
          <Animated.View style={[styles.shimmerCard, { opacity: scanShimmer }]}>
            <View style={styles.shimmerLine} />
            <View style={[styles.shimmerLine, { width: '60%' }]} />
            <View style={styles.shimmerMacroRow}>
              <View style={styles.shimmerPill} />
              <View style={styles.shimmerPill} />
              <View style={styles.shimmerPill} />
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    );
  }

  // ---- Error state -- categorized errors + dual retry options ----
  if (scanState === 'error') {
    const errorIcon: 'sad' | 'sick' = errorType === 'network' ? 'sad' : 'sick';
    const errorAnimation: 'sad' | 'sad' = 'sad';
    const errorIonIcon =
      errorType === 'network' ? 'cloud-offline-outline' :
      errorType === 'timeout' ? 'hourglass-outline' :
      errorType === 'camera' ? 'camera-outline' :
      'alert-circle-outline';

    return (
      <Animated.View
        style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg, opacity: stateOpacity }]}
        accessibilityLiveRegion="assertive"
      >
        <FitsiMascot expression={errorIcon} size="medium" animation={errorAnimation} />

        {/* Error type icon */}
        <View style={[styles.errorTypeIcon, { backgroundColor: c.surface }]}>
          <Ionicons name={errorIonIcon as any} size={28} color={c.accent} />
        </View>

        <ErrorFallback
          message={errorMsg || t('scan.couldNotAnalyze')}
          hint={errorHint || t('scan.networkErrorHint')}
          onRetry={handleRetryFromError}
          retryLabel={imageUri ? t('scan.retryWithSameImage') : t('scan.retry')}
        />

        {/* Additional option: try a different photo (only when retry same is available) */}
        {imageUri && (
          <TouchableOpacity
            style={[styles.manualFallbackBtn, { backgroundColor: c.surface, marginTop: spacing.xs }]}
            onPress={() => {
              haptics.light();
              handleRetry();
            }}
            activeOpacity={0.7}
            accessibilityLabel={t('scan.tryDifferentPhoto')}
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={16} color={c.black} />
            <Text style={[styles.manualFallbackText, { color: c.black }]}>{t('scan.tryDifferentPhoto')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.manualFallbackBtn, { backgroundColor: c.surface, marginTop: spacing.sm }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Registro', { screen: 'AddFood', params: { mealType: selectedMeal } });
          }}
          activeOpacity={0.7}
          accessibilityLabel={t('scan.addManually')}
          accessibilityRole="button"
          accessibilityHint="Agregar un alimento manualmente sin usar la camara"
        >
          <Ionicons name="create-outline" size={16} color={c.black} />
          <Text style={[styles.manualFallbackText, { color: c.black }]}>{t('scan.addManually')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: 'transparent', marginTop: spacing.xs }]}
          onPress={handleRetry}
          activeOpacity={0.7}
          accessibilityLabel="Volver al inicio"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back-outline" size={16} color={c.gray} />
          <Text style={[styles.retryBtnText, { color: c.gray }]}>Volver</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ---- Paywall gate -- free scan limit ----
  if (!isPremium && !scansLoading && todayScans >= FREE_SCAN_LIMIT) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg }]}>
        <View
          style={[styles.limitIcon, { backgroundColor: c.black }]}
          accessibilityLabel={t('scan.limitReached')}
        >
          <Ionicons name="lock-closed" size={36} color={c.white} />
        </View>
        <Text style={[styles.limitTitle, { color: c.black }]}>{t('scan.limitReached')}</Text>
        <Text style={[styles.limitSubtitle, { color: c.gray }]}>
          {t('scan.limitMessage', { limit: FREE_SCAN_LIMIT })}
        </Text>
        <TouchableOpacity
          style={[styles.upgradeBtn, { backgroundColor: c.black }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Perfil', { screen: 'Paywall' });
          }}
          activeOpacity={0.85}
          accessibilityLabel={t('scan.viewPremiumPlans')}
          accessibilityRole="button"
          accessibilityHint="Navega a la pantalla de suscripciones Premium"
        >
          <Text style={[styles.upgradeBtnText, { color: c.white }]}>{t('scan.viewPremiumPlans')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manualFallbackBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Registro', { screen: 'AddFood', params: { mealType: selectedMeal } });
          }}
          activeOpacity={0.7}
          accessibilityLabel={t('scan.addManually')}
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={16} color={c.black} />
          <Text style={[styles.manualFallbackText, { color: c.black }]}>{t('scan.addManually')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- Idle -- main scan UI ----
  return (
    <Animated.View
      style={[styles.screen, { paddingTop: insets.top, paddingHorizontal: sidePadding, backgroundColor: c.bg, opacity: stateOpacity }]}
    >
      {/* Header with Fitsi */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FitsiMascot expression="star" size="small" animation="wave" />
          <View>
            <Text style={[styles.title, { color: c.black }]} accessibilityRole="header">{t('scan.title')}</Text>
            <Text style={[styles.subtitle, { color: c.gray }]}>{t('scan.subtitle')}</Text>
          </View>
        </View>
      </View>

      {/* Camera viewfinder area */}
      <TouchableOpacity
        style={[styles.viewfinder, { width: contentWidth - sidePadding * 2 }]}
        onPress={() => pickImage('camera')}
        activeOpacity={0.85}
        accessibilityLabel={t('scan.tapToOpenCamera')}
        accessibilityRole="button"
        accessibilityHint="Toma una foto de tu alimento para analizar sus nutrientes con IA"
      >
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />
        <Animated.View style={[styles.cameraCircle, cameraCirclePulse]}>
          <Ionicons name="camera" size={40} color="#FFFFFF" />
        </Animated.View>
        <Text style={styles.viewfinderText}>{t('scan.tapToOpenCamera')}</Text>
      </TouchableOpacity>

      {/* Action buttons row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface }]}
          onPress={() => pickImage('library')}
          activeOpacity={0.7}
          accessibilityLabel={t('scan.gallery')}
          accessibilityRole="button"
          accessibilityHint="Selecciona una foto existente de tu galeria"
        >
          <Ionicons name="images-outline" size={18} color={c.black} />
          <Text style={[styles.actionBtnText, { color: c.black }]}>{t('scan.gallery')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.barcodeBtn, { backgroundColor: c.accent + '15', borderColor: c.accent + '30' }]}
          onPress={() => {
            haptics.light();
            navigation.navigate('Barcode', { mealType: selectedMeal });
          }}
          activeOpacity={0.7}
          accessibilityLabel={t('scan.barcode')}
          accessibilityRole="button"
          accessibilityHint="Abre el escaner de codigos de barras para buscar productos"
        >
          <Ionicons name="barcode-outline" size={18} color={c.accent} />
          <Text style={[styles.actionBtnText, { color: c.accent }]}>{t('scan.barcode')}</Text>
        </TouchableOpacity>
      </View>

      {/* Meal type selector */}
      <Text style={[styles.sectionLabel, { color: c.black }]}>{t('scan.mealType')}</Text>
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
              accessibilityLabel={t(mt.labelKey)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Ionicons name={mt.icon as any} size={15} color={isSelected ? c.white : mt.color} />
              <Text style={[styles.mealChipText, { color: c.black }, isSelected && { color: c.white }]}>
                {t(mt.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Banner plan gratuito */}
      {!isPremium && (
        scansError ? (
          <TouchableOpacity
            style={[styles.freeBanner, { backgroundColor: c.accent + '22' }]}
            onPress={() => {
              haptics.light();
              setScansError(false);
              setScansLoading(true);
              foodService.getFoodLogs().then((logs) => {
                setTodayScans(logs.filter((l) => l.ai_confidence !== null && l.ai_confidence < 1.0).length);
              }).catch(() => setScansError(true))
                .finally(() => setScansLoading(false));
            }}
            activeOpacity={0.8}
            accessibilityLabel={t('scan.scanLimitError')}
            accessibilityRole="button"
          >
            <Ionicons name="wifi-outline" size={14} color={c.accent} />
            <Text style={[styles.freeBannerText, { color: c.accent }]}>
              {t('scan.scanLimitError')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.freeBanner, { backgroundColor: c.badgeBg }]}
            onPress={() => {
              haptics.light();
              navigation.navigate('Perfil', { screen: 'Paywall' });
            }}
            activeOpacity={0.8}
            accessibilityLabel={scansLoading ? t('scan.loadingScans') : t('scan.freePlan', { used: todayScans, limit: FREE_SCAN_LIMIT })}
            accessibilityRole="button"
          >
            <Ionicons name="flash-outline" size={14} color={c.badgeText} />
            <Text style={[styles.freeBannerText, { color: c.badgeText }]}>
              {scansLoading
                ? t('scan.loadingScans')
                : t('scan.freePlan', { used: todayScans, limit: FREE_SCAN_LIMIT })}
            </Text>
            {!scansLoading && <Text style={[styles.freeBannerCta, { color: c.badgeText }]}>{t('scan.upgrade')}</Text>}
          </TouchableOpacity>
        )
      )}

      {/* Info */}
      <View style={styles.infoRow} accessibilityLabel={t('scan.aiPowered')}>
        <Ionicons name="shield-checkmark-outline" size={14} color={c.gray} />
        <Text style={[styles.infoText, { color: c.gray }]}>{t('scan.aiPowered')}</Text>
      </View>
    </Animated.View>
  );
}

const CORNER = 22;
const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: spacing.md },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  title:    { ...typography.titleMd },
  subtitle: { ...typography.subtitle, textAlign: 'center' },

  // Viewfinder
  viewfinder: {
    aspectRatio: 1,
    maxHeight: 260,
    backgroundColor: '#0A0A0A',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: spacing.sm,
    alignSelf: 'center',
    minHeight: 44,
  },
  cornerTL: { position: 'absolute', top: 14, left: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerTR: { position: 'absolute', top: 14, right: 14, width: CORNER, height: CORNER, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 14, left: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 14, right: 14, width: CORNER, height: CORNER, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF', borderRadius: 4 },
  cameraCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewfinderText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },

  // Action buttons row (gallery + barcode)
  actionRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
  },
  barcodeBtn: {
    borderWidth: 1,
  },
  actionBtnText: { ...typography.label },

  // Meal chips
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  mealTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    minHeight: 44,
  },
  mealChipText: { ...typography.label },

  // Info
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg, justifyContent: 'center' },
  infoText: { ...typography.caption },

  // Scanning state
  scanningPreview: { width: '100%', height: '100%', position: 'absolute' },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  scanningText: { ...typography.titleSm, color: '#FFFFFF' },
  scanningHint: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },

  // Result
  resultTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.md,
  },
  resultThumbnail: {
    width: 72, height: 72, borderRadius: radius.md,
  },
  previewImage: {
    height: 200, borderRadius: radius.xl, marginBottom: spacing.md,
  },
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
    gap: spacing.sm, ...shadows.sm,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultFood: { ...typography.titleSm, flex: 1 },
  resultConfidence: { ...typography.caption },
  editNameInput: {
    ...typography.titleSm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 40,
  },
  editCalorieRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  editCalorieInput: {
    fontSize: 36, fontWeight: '800' as const, letterSpacing: -1,
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    textAlign: 'center', minWidth: 120,
  },
  editMacroInput: {
    fontSize: 16, fontWeight: '800' as const,
    textAlign: 'center',
    paddingVertical: 2,
  },
  cacheBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3, borderRadius: radius.full,
  },
  cacheBadgeText: { fontSize: 11, fontWeight: '700' },
  aiProviderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  aiProviderBadgeText: { fontSize: 12, fontWeight: '700' },
  calorieBox: { alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  calorieValue: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  calorieUnit: { ...typography.label },
  servingSize: { ...typography.caption, marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  macroPill: {
    flex: 1, alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
  macroPillValue: { fontSize: 16, fontWeight: '800' },
  macroPillLabel: { ...typography.caption, marginTop: 2 },
  extraRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  extraItem: { ...typography.caption },
  mealBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start', paddingHorizontal: spacing.md,
    paddingVertical: 5, borderRadius: radius.full,
  },
  mealBadgeText: { ...typography.caption, fontWeight: '700' },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 52,
  },
  confirmBtnText: { ...typography.button },
  editMacrosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    marginBottom: spacing.sm, minHeight: 48, borderWidth: 1,
  },
  editMacrosBtnText: { ...typography.button },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.full,
    minHeight: 48,
  },
  retryBtnText: { ...typography.button },

  // Free plan banner
  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.md, minHeight: 44,
  },
  freeBannerText: { ...typography.caption, flex: 1 },
  freeBannerCta: { ...typography.caption, fontWeight: '700' },

  // Paywall gate
  limitIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  limitTitle: { ...typography.titleSm, marginBottom: spacing.sm },
  limitSubtitle: { ...typography.subtitle, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  upgradeBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginBottom: spacing.sm, width: '100%', alignItems: 'center',
    minHeight: 52,
  },
  upgradeBtnText: { ...typography.button },
  manualFallbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    width: '100%', justifyContent: 'center', minHeight: 48,
  },
  manualFallbackText: { ...typography.label },

  // Error type icon
  errorTypeIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  // Shimmer skeleton
  shimmerCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    gap: 12,
    marginTop: spacing.md,
  },
  shimmerLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: '85%',
  },
  shimmerMacroRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  shimmerPill: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // Success
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successText: { ...typography.titleMd },
  successHint: { ...typography.caption, marginTop: spacing.xs },

  // High calorie tip
  highCalorieTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  highCalorieTipText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },

  // Daily progress
  dailyProgressContainer: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  dailyProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dailyProgressHint: {
    ...typography.caption,
    flex: 1,
  },
  dailyProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  dailyProgressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  dailyProgressMealFill: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 3,
  },
  dailyProgressText: {
    ...typography.caption,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
