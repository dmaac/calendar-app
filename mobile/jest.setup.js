// jest.setup.js — Global setup for React Native Testing Library

// AsyncStorage mock is handled by moduleNameMapper in jest.config.js

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const mockComponent = (name) => {
    return React.forwardRef((props, ref) => {
      return React.createElement(name, { ...props, ref }, props.children);
    });
  };

  return {
    __esModule: true,
    default: mockComponent('Svg'),
    Svg: mockComponent('Svg'),
    Circle: mockComponent('Circle'),
    Rect: mockComponent('Rect'),
    Path: mockComponent('Path'),
    G: mockComponent('G'),
    Text: mockComponent('Text'),
    Line: mockComponent('Line'),
    Polygon: mockComponent('Polygon'),
    Polyline: mockComponent('Polyline'),
    Defs: mockComponent('Defs'),
    ClipPath: mockComponent('ClipPath'),
    LinearGradient: mockComponent('LinearGradient'),
    RadialGradient: mockComponent('RadialGradient'),
    Stop: mockComponent('Stop'),
    Use: mockComponent('Use'),
    Symbol: mockComponent('Symbol'),
    Ellipse: mockComponent('Ellipse'),
  };
});

// Platform mock is handled by jest-expo preset — do not override here
