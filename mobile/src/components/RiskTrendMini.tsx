/**
 * RiskTrendMini — Tiny 7-dot trend chart for risk score history.
 *
 * Renders a ~200x40px inline chart showing the last 7 days of risk scores.
 * Each dot is colored by risk zone (green/yellow/orange/red).
 * Dots are connected by a thin gray line.
 *
 * Props:
 *   scores: number[] — array of 7 risk scores, most recent last.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useThemeColors } from '../theme';

interface RiskTrendMiniProps {
  scores: number[];
}

function getDotColor(score: number): string {
  if (score < 20) return '#22C55E';
  if (score < 40) return '#EAB308';
  if (score < 60) return '#F97316';
  if (score < 80) return '#EF4444';
  return '#DC2626';
}

const WIDTH = 200;
const HEIGHT = 40;
const PADDING_X = 12;
const PADDING_Y = 8;
const DOT_R = 4;

const RiskTrendMini = React.memo(function RiskTrendMini({ scores }: RiskTrendMiniProps) {
  const c = useThemeColors();
  const count = scores.length;
  if (count === 0) return null;

  const usableW = WIDTH - PADDING_X * 2;
  const usableH = HEIGHT - PADDING_Y * 2;
  const stepX = count > 1 ? usableW / (count - 1) : 0;

  const points = scores.map((s, i) => {
    const clamped = Math.max(0, Math.min(100, Math.round(s)));
    const x = PADDING_X + i * stepX;
    const y = PADDING_Y + usableH - (clamped / 100) * usableH;
    return { x, y, score: clamped };
  });

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Tendencia de riesgo: ${scores.map((s) => Math.round(s)).join(', ')}`}
      accessibilityRole="image"
    >
      <Svg width={WIDTH} height={HEIGHT}>
        {/* Connecting lines */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          return (
            <Line
              key={`line-${i}`}
              x1={prev.x}
              y1={prev.y}
              x2={pt.x}
              y2={pt.y}
              stroke={c.grayLight}
              strokeWidth={1.5}
            />
          );
        })}
        {/* Dots */}
        {points.map((pt, i) => (
          <Circle
            key={`dot-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={DOT_R}
            fill={getDotColor(pt.score)}
          />
        ))}
      </Svg>
    </View>
  );
});

export default RiskTrendMini;

const styles = StyleSheet.create({
  container: {
    width: WIDTH,
    height: HEIGHT,
    alignSelf: 'center',
  },
});
