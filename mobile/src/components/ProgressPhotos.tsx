/**
 * ProgressPhotos -- Photo tracking component for body transformation progress.
 *
 * Features:
 * 1. Capture photos via expo-image-picker (camera or gallery)
 * 2. Three pose categories: Front / Side / Back
 * 3. Photos stored in AsyncStorage as base64 with ISO date
 * 4. Side-by-side comparator: "Week 1 vs Today"
 * 5. Weekly thumbnail grid grouped by date
 * 6. Full dark mode support via ThemeContext
 *
 * Uses: expo-image-picker, AsyncStorage, theme system, haptics, analytics.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  Dimensions,
  Animated,
  Easing,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';
import FitsiMascot from './FitsiMascot';

// ─── Types ──────────────────────────────────────────────────────────────────

type PoseType = 'front' | 'side' | 'back';

interface ProgressPhoto {
  id: string;
  uri: string;
  base64: string;
  pose: PoseType;
  date: string; // ISO date string (YYYY-MM-DD)
  createdAt: string; // Full ISO timestamp
}

interface PhotoGroup {
  weekLabel: string;
  date: string;
  photos: ProgressPhoto[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_progress_photos';
const POSES: { key: PoseType; label: string; icon: string }[] = [
  { key: 'front', label: 'Frontal', icon: 'person-outline' },
  { key: 'side', label: 'Lateral', icon: 'body-outline' },
  { key: 'back', label: 'Espalda', icon: 'accessibility-outline' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getISODate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function getWeekLabel(dateStr: string, allDates: string[]): string {
  if (allDates.length === 0) return 'Semana 1';
  const sorted = [...allDates].sort();
  const firstDate = new Date(sorted[0]);
  const thisDate = new Date(dateStr);
  const diffMs = thisDate.getTime() - firstDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return `Semana ${diffWeeks + 1}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ProgressPhotos() {
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const { track } = useAnalytics('ProgressPhotos');

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPose, setSelectedPose] = useState<PoseType>('front');
  const [comparatorVisible, setComparatorVisible] = useState(false);
  const [compareLeft, setCompareLeft] = useState<ProgressPhoto | null>(null);
  const [compareRight, setCompareRight] = useState<ProgressPhoto | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = useState<ProgressPhoto | null>(null);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // ─── Storage ────────────────────────────────────────────────────────────────

  const loadPhotos = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: ProgressPhoto[] = JSON.parse(raw);
        setPhotos(parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
    } catch (err) {
      // Silent fail — empty state will show
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const savePhotos = useCallback(async (updated: ProgressPhoto[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      Alert.alert('Error', 'No se pudo guardar la foto. Intenta de nuevo.');
    }
  }, []);

  // ─── Photo Capture ──────────────────────────────────────────────────────────

  const pickImage = useCallback(async (source: 'camera' | 'gallery') => {
    haptics.light();

    const permissionFn = source === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const { status } = await permissionFn();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso requerido',
        source === 'camera'
          ? 'Necesitamos acceso a la camara para tomar fotos de progreso.'
          : 'Necesitamos acceso a la galeria para seleccionar fotos.',
      );
      return;
    }

    const launchFn = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await launchFn({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (!asset.base64) return;

      const newPhoto: ProgressPhoto = {
        id: generateId(),
        uri: asset.uri,
        base64: asset.base64,
        pose: selectedPose,
        date: getISODate(),
        createdAt: new Date().toISOString(),
      };

      const updated = [newPhoto, ...photos];
      setPhotos(updated);
      await savePhotos(updated);

      haptics.success();
      track('progress_photo_added', { pose: selectedPose, source });
    }
  }, [photos, selectedPose, savePhotos, track]);

  const showPickerOptions = useCallback(() => {
    haptics.light();
    Alert.alert(
      'Agregar foto de progreso',
      `Pose: ${POSES.find((p) => p.key === selectedPose)?.label}`,
      [
        { text: 'Camara', onPress: () => pickImage('camera') },
        { text: 'Galeria', onPress: () => pickImage('gallery') },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }, [pickImage, selectedPose]);

  const deletePhoto = useCallback(async (photoId: string) => {
    haptics.heavy();
    Alert.alert('Eliminar foto', 'Esta accion no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const updated = photos.filter((p) => p.id !== photoId);
          setPhotos(updated);
          await savePhotos(updated);
          track('progress_photo_deleted');
        },
      },
    ]);
  }, [photos, savePhotos, track]);

  // ─── Comparator ─────────────────────────────────────────────────────────────

  const openComparator = useCallback(() => {
    if (photos.length < 2) {
      Alert.alert('Necesitas al menos 2 fotos', 'Sigue tomando fotos cada semana para comparar tu progreso.');
      return;
    }

    haptics.medium();
    const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    setCompareLeft(sorted[0]);
    setCompareRight(sorted[sorted.length - 1]);
    setComparatorVisible(true);
    track('comparator_opened');
  }, [photos, track]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const photoGroups: PhotoGroup[] = useMemo(() => {
    const allDates = [...new Set(photos.map((p) => p.date))];
    const grouped = new Map<string, ProgressPhoto[]>();

    for (const photo of photos) {
      const key = photo.date;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(photo);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, datePhotos]) => ({
        weekLabel: getWeekLabel(date, allDates),
        date,
        photos: datePhotos,
      }));
  }, [photos]);

  const hasPhotos = photos.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <Text style={[s.sectionTitle, { color: c.black }]}>Progress Photos</Text>

        {/* Pose selector */}
        <View style={s.poseRow}>
          {POSES.map((pose) => {
            const isActive = selectedPose === pose.key;
            return (
              <TouchableOpacity
                key={pose.key}
                style={[
                  s.posePill,
                  { backgroundColor: c.grayLight + '30' },
                  isActive && { backgroundColor: c.accent },
                ]}
                onPress={() => { haptics.selection(); setSelectedPose(pose.key); }}
                activeOpacity={0.7}
                accessibilityLabel={`Seleccionar pose ${pose.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={pose.icon as any}
                  size={16}
                  color={isActive ? c.white : c.gray}
                />
                <Text style={[
                  s.posePillText,
                  { color: c.gray },
                  isActive && { color: c.white },
                ]}>
                  {pose.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Empty state */}
        {!hasPhotos && !loading && (
          <View style={s.emptyState}>
            <FitsiMascot expression="cute" size="small" animation="idle" />
            <Text style={[s.emptyTitle, { color: c.black }]}>No hay fotos todavia</Text>
            <Text style={[s.emptyDesc, { color: c.gray }]}>
              Toma una foto cada semana para ver tu transformacion visual
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.uploadBtn, { backgroundColor: c.accent }]}
            onPress={showPickerOptions}
            activeOpacity={0.8}
            accessibilityLabel="Agregar foto de progreso"
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={20} color={c.white} />
            <Text style={[s.uploadBtnText, { color: c.white }]}>+ Agregar Foto</Text>
          </TouchableOpacity>

          {hasPhotos && (
            <TouchableOpacity
              style={[s.compareBtn, { borderColor: c.accent }]}
              onPress={openComparator}
              activeOpacity={0.7}
              accessibilityLabel="Comparar fotos"
              accessibilityRole="button"
            >
              <Ionicons name="git-compare-outline" size={18} color={c.accent} />
              <Text style={[s.compareBtnText, { color: c.accent }]}>Comparar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photo Grid by Week */}
        {hasPhotos && (
          <View style={s.gridContainer}>
            {photoGroups.map((group) => (
              <View key={group.date} style={s.weekGroup}>
                <View style={s.weekHeader}>
                  <Text style={[s.weekLabel, { color: c.black }]}>{group.weekLabel}</Text>
                  <Text style={[s.weekDate, { color: c.gray }]}>{formatDisplayDate(group.date)}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.weekPhotosScroll}
                >
                  {group.photos.map((photo) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={[s.thumbnail, { borderColor: c.grayLight }]}
                      onPress={() => { haptics.light(); setFullScreenPhoto(photo); }}
                      onLongPress={() => deletePhoto(photo.id)}
                      activeOpacity={0.8}
                      accessibilityLabel={`Foto ${photo.pose}, ${formatDisplayDate(photo.date)}`}
                      accessibilityRole="image"
                    >
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${photo.base64}` }}
                        style={s.thumbnailImage}
                      />
                      <View style={[s.poseBadge, { backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF' }]}>
                        <Text style={[s.poseBadgeText, { color: c.accent }]}>
                          {POSES.find((p) => p.key === photo.pose)?.label ?? photo.pose}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {/* Placeholder grid when no photos */}
        {!hasPhotos && !loading && (
          <View style={s.placeholderGrid}>
            {POSES.map((pose) => (
              <View
                key={pose.key}
                style={[s.placeholder, { borderColor: c.grayLight, backgroundColor: c.grayLight + '15' }]}
              >
                <Ionicons name={pose.icon as any} size={28} color={c.disabled} />
                <Text style={[s.placeholderLabel, { color: c.disabled }]}>{pose.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Full-screen Photo Viewer ── */}
      <Modal
        visible={fullScreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenPhoto(null)}
        statusBarTranslucent
      >
        <View style={s.fullScreenOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFullScreenPhoto(null)}
          />
          {fullScreenPhoto && (
            <View style={s.fullScreenContent}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${fullScreenPhoto.base64}` }}
                style={s.fullScreenImage}
                resizeMode="contain"
              />
              <View style={[s.fullScreenInfo, { backgroundColor: isDark ? '#1A1A2EDD' : '#FFFFFFDD' }]}>
                <Text style={[s.fullScreenPose, { color: c.accent }]}>
                  {POSES.find((p) => p.key === fullScreenPhoto.pose)?.label}
                </Text>
                <Text style={[s.fullScreenDate, { color: c.gray }]}>
                  {formatDisplayDate(fullScreenPhoto.date)}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.closeBtn, { backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF' }]}
                onPress={() => setFullScreenPhoto(null)}
                accessibilityLabel="Cerrar"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={c.black} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Side-by-Side Comparator ── */}
      <Modal
        visible={comparatorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setComparatorVisible(false)}
        statusBarTranslucent
      >
        <View style={[s.comparatorOverlay, { backgroundColor: isDark ? '#0D0D1AF5' : '#FFFFFFF5' }]}>
          {/* Header */}
          <View style={s.comparatorHeader}>
            <TouchableOpacity
              onPress={() => { haptics.light(); setComparatorVisible(false); }}
              accessibilityLabel="Cerrar comparador"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={28} color={c.black} />
            </TouchableOpacity>
            <Text style={[s.comparatorTitle, { color: c.black }]}>Comparar Progreso</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Labels */}
          <View style={s.comparatorLabels}>
            <Text style={[s.comparatorLabel, { color: c.accent }]}>
              {compareLeft ? getWeekLabel(compareLeft.date, photos.map((p) => p.date)) : ''}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={c.gray} />
            <Text style={[s.comparatorLabel, { color: c.accent }]}>
              {compareRight ? getWeekLabel(compareRight.date, photos.map((p) => p.date)) : 'Hoy'}
            </Text>
          </View>

          {/* Side-by-side photos */}
          <View style={s.comparatorBody}>
            <ComparatorSlot
              photo={compareLeft}
              label={compareLeft ? formatDisplayDate(compareLeft.date) : 'Inicio'}
              isDark={isDark}
              colors={c}
            />
            <View style={[s.comparatorDivider, { backgroundColor: c.grayLight }]} />
            <ComparatorSlot
              photo={compareRight}
              label={compareRight ? formatDisplayDate(compareRight.date) : 'Actual'}
              isDark={isDark}
              colors={c}
            />
          </View>

          {/* Photo selector scrolls */}
          <Text style={[s.comparatorHint, { color: c.gray }]}>
            Toca una foto abajo para cambiar la seleccion
          </Text>
          <View style={s.comparatorSelectors}>
            <PhotoSelector
              photos={photos}
              selected={compareLeft}
              onSelect={setCompareLeft}
              label="Antes"
              isDark={isDark}
              colors={c}
            />
            <PhotoSelector
              photos={photos}
              selected={compareRight}
              onSelect={setCompareRight}
              label="Despues"
              isDark={isDark}
              colors={c}
            />
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ─── Comparator Sub-components ──────────────────────────────────────────────

const ComparatorSlot = React.memo(function ComparatorSlot({
  photo,
  label,
  isDark,
  colors: c,
}: {
  photo: ProgressPhoto | null;
  label: string;
  isDark: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const halfWidth = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;

  return (
    <View style={[s.comparatorSlot, { width: halfWidth }]}>
      {photo ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${photo.base64}` }}
          style={[s.comparatorImage, { borderColor: c.grayLight }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[s.comparatorEmpty, { borderColor: c.grayLight, backgroundColor: c.grayLight + '15' }]}>
          <Ionicons name="image-outline" size={32} color={c.disabled} />
        </View>
      )}
      <Text style={[s.comparatorSlotLabel, { color: c.gray }]}>{label}</Text>
    </View>
  );
});

const PhotoSelector = React.memo(function PhotoSelector({
  photos,
  selected,
  onSelect,
  label,
  isDark,
  colors: c,
}: {
  photos: ProgressPhoto[];
  selected: ProgressPhoto | null;
  onSelect: (p: ProgressPhoto) => void;
  label: string;
  isDark: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={s.selectorColumn}>
      <Text style={[s.selectorLabel, { color: c.black }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((photo) => {
            const isSelected = selected?.id === photo.id;
            return (
              <TouchableOpacity
                key={photo.id}
                style={[
                  s.selectorThumb,
                  { borderColor: c.grayLight },
                  isSelected && { borderColor: c.accent, borderWidth: 2 },
                ]}
                onPress={() => { haptics.selection(); onSelect(photo); }}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: `data:image/jpeg;base64,${photo.base64}` }}
                  style={s.selectorThumbImage}
                />
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.sm,
  },

  // Pose selector
  poseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  posePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  posePillText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyMd,
    marginTop: spacing.xs,
  },
  emptyDesc: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingVertical: 12,
  },
  uploadBtnText: {
    ...typography.button,
  },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.full,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  compareBtnText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Photo grid
  gridContainer: {
    gap: spacing.md,
  },
  weekGroup: {
    gap: spacing.xs,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  weekLabel: {
    ...typography.label,
  },
  weekDate: {
    ...typography.caption,
  },
  weekPhotosScroll: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  thumbnail: {
    width: 100,
    height: 133,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  poseBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  poseBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Placeholder grid
  placeholderGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  placeholder: {
    flex: 1,
    aspectRatio: 0.75,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  placeholderLabel: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Full-screen viewer
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenContent: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH - spacing.lg * 2,
    height: SCREEN_WIDTH * 1.33,
    borderRadius: radius.lg,
  },
  fullScreenInfo: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  fullScreenPose: {
    ...typography.label,
  },
  fullScreenDate: {
    ...typography.caption,
  },
  closeBtn: {
    position: 'absolute',
    top: -60,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },

  // Comparator modal
  comparatorOverlay: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
  },
  comparatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  comparatorTitle: {
    ...typography.titleSm,
  },
  comparatorLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  comparatorLabel: {
    ...typography.label,
    fontWeight: '700',
  },
  comparatorBody: {
    flexDirection: 'row',
    gap: 0,
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  comparatorDivider: {
    width: 1,
    height: '100%',
    marginHorizontal: spacing.xs,
  },
  comparatorSlot: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  comparatorImage: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  comparatorEmpty: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparatorSlotLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  comparatorHint: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  comparatorSelectors: {
    gap: spacing.md,
  },
  selectorColumn: {
    gap: spacing.xs,
  },
  selectorLabel: {
    ...typography.label,
  },
  selectorThumb: {
    width: 56,
    height: 75,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  selectorThumbImage: {
    width: '100%',
    height: '100%',
  },
});
