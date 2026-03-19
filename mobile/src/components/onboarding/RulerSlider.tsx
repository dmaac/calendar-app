/**
 * RulerSlider — slider tipo regla horizontal cross-platform
 * El usuario scrollea horizontalmente, el indicador central es fijo.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { colors, useLayout } from '../../theme';

const TICK_WIDTH = 10;       // ancho de cada tick en px
const MAJOR_EVERY = 5;       // tick mayor cada N ticks (= 1 unidad si step=0.2)

interface RulerSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;             // default 0.5
  unit: string;              // 'kg' | 'lb' | 'cm'
  label?: string;            // ej. "Lose weight"
  onChange: (value: number) => void;
}

export default function RulerSlider({
  value,
  min,
  max,
  step = 0.5,
  unit,
  label,
  onChange,
}: RulerSliderProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { innerWidth } = useLayout();
  const totalTicks = Math.round((max - min) / step);
  const webScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWeb = Platform.OS === 'web';

  // Scroll al valor inicial
  useEffect(() => {
    const idx = Math.round((value - min) / step);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: idx * TICK_WIDTH, animated: false });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const snapToValue = useCallback(
    (x: number, animated = true) => {
      const idx = Math.round(x / TICK_WIDTH);
      const clamped = Math.max(0, Math.min(totalTicks, idx));
      const newVal = +(min + clamped * step).toFixed(1);
      scrollRef.current?.scrollTo({ x: clamped * TICK_WIDTH, animated });
      onChange(newVal);
    },
    [min, step, totalTicks, onChange]
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      snapToValue(e.nativeEvent.contentOffset.x);
    },
    [snapToValue]
  );

  // Web: debounce 150ms para detectar fin de scroll
  const handleWebScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
      const x = e.nativeEvent.contentOffset.x;
      webScrollTimer.current = setTimeout(() => {
        snapToValue(x);
      }, 150);
    },
    [snapToValue]
  );

  const centerX = innerWidth / 2;

  return (
    <View style={styles.wrapper}>
      {/* Etiqueta opcional */}
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      {/* Valor actual */}
      <Text style={styles.value}>
        {value.toFixed(1)}{' '}
        <Text style={styles.unit}>{unit}</Text>
      </Text>

      {/* Ruler container */}
      <View style={[styles.rulerContainer, { width: innerWidth }]}>
        {/* Indicador central fijo */}
        <View
          pointerEvents="none"
          style={[styles.indicator, { left: centerX - 1 }]}
        />

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={isWeb ? undefined : TICK_WIDTH}
          decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
          onMomentumScrollEnd={isWeb ? undefined : handleScrollEnd}
          onScrollEndDrag={isWeb ? undefined : handleScrollEnd}
          onScroll={isWeb ? handleWebScroll : undefined}
          contentContainerStyle={{
            paddingHorizontal: centerX,
          }}
          scrollEventThrottle={16}
        >
          {Array.from({ length: totalTicks + 1 }).map((_, i) => {
            const isMajor = i % MAJOR_EVERY === 0;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.tick, { width: TICK_WIDTH }]}
                onPress={() => snapToValue(i * TICK_WIDTH)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.tickMark,
                    {
                      height: isMajor ? 36 : 22,
                      width: isMajor ? 2 : 1,
                      backgroundColor: isMajor ? colors.black : colors.grayLight,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: colors.gray,
    fontWeight: '500',
  },
  value: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: -1,
  },
  unit: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.black,
  },
  rulerContainer: {
    height: 64,
    position: 'relative',
    overflow: 'hidden',
    marginTop: 8,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.black,
    zIndex: 10,
  },
  tick: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    height: '100%',
  },
  tickMark: {
    borderRadius: 1,
  },
});
