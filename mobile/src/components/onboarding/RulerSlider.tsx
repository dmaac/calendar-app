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

  // Scroll al valor inicial
  useEffect(() => {
    const idx = Math.round((value - min) / step);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: idx * TICK_WIDTH, animated: false });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / TICK_WIDTH);
      const clamped = Math.max(0, Math.min(totalTicks, idx));
      const newVal = +(min + clamped * step).toFixed(1);

      // Snap
      scrollRef.current?.scrollTo({ x: clamped * TICK_WIDTH, animated: true });
      onChange(newVal);
    },
    [min, step, totalTicks, onChange]
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
          snapToInterval={TICK_WIDTH}
          decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          contentContainerStyle={{
            paddingHorizontal: centerX,
          }}
          scrollEventThrottle={16}
        >
          {Array.from({ length: totalTicks + 1 }).map((_, i) => {
            const isMajor = i % MAJOR_EVERY === 0;
            return (
              <View
                key={i}
                style={[styles.tick, { width: TICK_WIDTH }]}
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
              </View>
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
