/**
 * ScrollPicker — wheel picker cross-platform (iOS / Android / Web)
 * Muestra 5 ítems, el central es el seleccionado.
 * Web: usa onScroll con debounce + tap directo en ítem.
 * Native: usa onMomentumScrollEnd + snapToInterval.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
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
import { colors } from '../../theme';

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface ScrollPickerProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width?: number;
}

export default function ScrollPicker({
  items,
  selectedIndex,
  onSelect,
  width = 100,
}: ScrollPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [localIndex, setLocalIndex] = useState(selectedIndex);
  const webScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll inicial al índice seleccionado
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
      setLocalIndex(selectedIndex);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const snapToIndex = useCallback((rawIndex: number, animated = true) => {
    const clamped = Math.max(0, Math.min(items.length - 1, rawIndex));
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated });
    setLocalIndex(clamped);
    onSelect(clamped);
  }, [items.length, onSelect]);

  // Native: snap al soltar el scroll
  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    snapToIndex(Math.round(y / ITEM_HEIGHT));
  };

  // Web: debounce de 150ms para detectar fin de scroll
  const handleWebScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
    const y = e.nativeEvent.contentOffset.y;
    webScrollTimer.current = setTimeout(() => {
      snapToIndex(Math.round(y / ITEM_HEIGHT));
    }, 150);
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.container, { width }]}>
      {/* Highlight debajo del ScrollView */}
      <View style={styles.selectionHighlight} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        style={[{ height: PICKER_HEIGHT }, styles.scrollView]}
        showsVerticalScrollIndicator={false}
        snapToInterval={isWeb ? undefined : ITEM_HEIGHT}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
        onMomentumScrollEnd={isWeb ? undefined : handleScrollEnd}
        onScrollEndDrag={isWeb ? undefined : handleScrollEnd}
        onScroll={isWeb ? handleWebScroll : undefined}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: ITEM_HEIGHT * 2,
          paddingBottom: ITEM_HEIGHT * 2,
        }}
      >
        {items.map((item, i) => {
          const isSelected = i === localIndex;
          const distance = Math.abs(i - localIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.35;
          const fontSize = distance === 0 ? 20 : 16;

          return (
            <TouchableOpacity
              key={`${item}-${i}`}
              style={[styles.item, { height: ITEM_HEIGHT }]}
              onPress={() => snapToIndex(i)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.itemText,
                  {
                    fontSize,
                    fontWeight: isSelected ? '700' : '400',
                    color: isSelected ? colors.black : colors.gray,
                    opacity,
                  },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Fades encima para difuminar los bordes */}
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollView: {
    position: 'relative',
    zIndex: 2,
  },
  selectionHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: 10,
    zIndex: 1,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  item: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    textAlign: 'center',
  },
});

export { ITEM_HEIGHT, PICKER_HEIGHT };
