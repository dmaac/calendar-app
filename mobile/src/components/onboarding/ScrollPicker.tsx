/**
 * ScrollPicker — wheel picker cross-platform (iOS / Android / Web)
 * Muestra 5 ítems, el central es el seleccionado.
 */
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
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
  const isScrolling = useRef(false);

  // Scroll inicial al índice seleccionado
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));

    // Snap suave al ítem más cercano
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });

    setLocalIndex(clamped);
    onSelect(clamped);
    isScrolling.current = false;
  };

  return (
    <View style={[styles.container, { width }]}>
      {/* Overlay superior: fade out */}
      <View style={styles.fadeTop} pointerEvents="none" />

      {/* Highlight del ítem seleccionado */}
      <View style={styles.selectionHighlight} pointerEvents="none" />

      {/* Overlay inferior: fade out */}
      <View style={styles.fadeBottom} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentContainerStyle={{
          paddingTop: ITEM_HEIGHT * 2,
          paddingBottom: ITEM_HEIGHT * 2,
        }}
        scrollEventThrottle={16}
      >
        {items.map((item, i) => {
          const isSelected = i === localIndex;
          const distance = Math.abs(i - localIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.5 : 0.2;
          const fontSize = distance === 0 ? 20 : 16;

          return (
            <View
              key={`${item}-${i}`}
              style={[styles.item, { height: ITEM_HEIGHT }]}
            >
              <Text
                style={[
                  styles.itemText,
                  {
                    fontSize,
                    fontWeight: isSelected ? '600' : '400',
                    color: isSelected ? colors.black : colors.gray,
                    opacity,
                  },
                ]}
              >
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: 10,
    zIndex: 0,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 2,
    // Gradiente simulado con opacidad
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  item: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  itemText: {
    textAlign: 'center',
  },
});

export { ITEM_HEIGHT, PICKER_HEIGHT };
