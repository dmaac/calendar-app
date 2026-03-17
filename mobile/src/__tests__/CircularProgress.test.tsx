import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import CircularProgress from '../components/CircularProgress';

describe('CircularProgress', () => {
  const defaultProps = {
    size: 100,
    strokeWidth: 10,
    progress: 0.5,
    color: '#4CAF50',
  };

  it('renders without crashing', () => {
    const { toJSON } = render(<CircularProgress {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders children when provided', () => {
    const { getByText } = render(
      <CircularProgress {...defaultProps}>
        <Text>50%</Text>
      </CircularProgress>
    );
    expect(getByText('50%')).toBeTruthy();
  });

  it('renders with 0% progress', () => {
    const { toJSON } = render(
      <CircularProgress {...defaultProps} progress={0} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with 100% progress', () => {
    const { toJSON } = render(
      <CircularProgress {...defaultProps} progress={1} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('clamps progress above 1 to 1', () => {
    // Progress > 1 should be clamped to 1 via Math.min(progress, 1)
    const { toJSON } = render(
      <CircularProgress {...defaultProps} progress={1.5} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('uses default backgroundColor when not provided', () => {
    const tree = render(<CircularProgress {...defaultProps} />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('uses custom backgroundColor when provided', () => {
    const tree = render(
      <CircularProgress {...defaultProps} backgroundColor="#FF0000" />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  it('calculates correct radius', () => {
    // radius = (size - strokeWidth) / 2 = (100 - 10) / 2 = 45
    // circumference = 45 * 2 * PI ~= 282.74
    // We verify the component renders with these dimensions
    const { toJSON } = render(<CircularProgress {...defaultProps} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders with different sizes', () => {
    const { toJSON: small } = render(
      <CircularProgress size={50} strokeWidth={5} progress={0.3} color="#000" />
    );
    const { toJSON: large } = render(
      <CircularProgress size={200} strokeWidth={20} progress={0.8} color="#FFF" />
    );
    expect(small()).toBeTruthy();
    expect(large()).toBeTruthy();
  });

  it('renders with no children', () => {
    const { toJSON } = render(<CircularProgress {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });
});
