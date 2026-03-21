/**
 * OnboardingNavigator — orquesta los 30 módulos del onboarding
 * Cada paso es un componente independiente.
 * El estado vive en OnboardingContext.
 */
import React, { useCallback, useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Step01Splash         from './Step01Splash';
import Step02Welcome        from './Step02Welcome';
import Step03Gender         from './Step03Gender';
import Step04Workouts       from './Step04Workouts';
import Step05Source         from './Step05Source';
import Step06OtherApps      from './Step06OtherApps';
import Step07SocialProof    from './Step07SocialProof';
import Step08HeightWeight   from './Step08HeightWeight';
import Step09Birthday       from './Step09Birthday';
import Step10Goal           from './Step10Goal';
import Step11TargetWeight   from './Step11TargetWeight';
import Step12Affirmation    from './Step12Affirmation';
import Step13Speed          from './Step13Speed';
import Step14Comparison     from './Step14Comparison';
import Step15PainPoints     from './Step15PainPoints';
import Step16Diet           from './Step16Diet';
import Step17Accomplish     from './Step17Accomplish';
import Step18ProgressChart  from './Step18ProgressChart';
import Step19Trust          from './Step19Trust';
import Step20Health         from './Step20Health';
import Step21Reviews        from './Step21Reviews';
import Step22Flexibility    from './Step22Flexibility';
import Step23Notifications  from './Step23Notifications';
import Step24Referral       from './Step24Referral';
import Step25Account        from './Step25Account';
import Step26PlanBuilding   from './Step26PlanBuilding';
import Step27PlanReady      from './Step27PlanReady';
import Step28Paywall        from './Step28Paywall';
import Step29SpinWheel      from './Step29SpinWheel';
import Step30PaywallDiscount from './Step30PaywallDiscount';

interface OnboardingNavigatorProps {
  onComplete: () => void;
}

export const TOTAL_STEPS = 30;

export default function OnboardingNavigator({ onComplete }: OnboardingNavigatorProps) {
  const { currentStep, setCurrentStep } = useOnboarding();
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  // Smooth fade + slide transition between onboarding steps
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevStep = useRef(currentStep);

  useEffect(() => {
    if (prevStep.current !== currentStep) {
      const isForward = currentStep > prevStep.current;
      setDirection(isForward ? 'forward' : 'back');
      prevStep.current = currentStep;

      // Reset for entrance
      fadeAnim.setValue(0);
      slideAnim.setValue(isForward ? 30 : -30);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentStep]);

  const goNext = useCallback(() => {
    haptics.light();
    if (currentStep >= TOTAL_STEPS) {
      handleComplete();
    } else {
      // Animate out, then switch step
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setCurrentStep(currentStep + 1);
      });
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    haptics.light();
    if (currentStep > 1) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 30, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setCurrentStep(currentStep - 1);
      });
    }
  }, [currentStep]);

  const handleComplete = async () => {
    haptics.success();
    await AsyncStorage.setItem('onboarding_completed', 'true');
    onComplete();
  };

  const renderStep = () => {
    const props = { onNext: goNext, onBack: goBack, step: currentStep, totalSteps: TOTAL_STEPS };

    switch (currentStep) {
      case 1:  return <Step01Splash {...props} />;
      case 2:  return <Step02Welcome {...props} onSkipToLogin={handleComplete} />;
      case 3:  return <Step03Gender {...props} />;
      case 4:  return <Step04Workouts {...props} />;
      case 5:  return <Step05Source {...props} />;
      case 6:  return <Step06OtherApps {...props} />;
      case 7:  return <Step07SocialProof {...props} />;
      case 8:  return <Step08HeightWeight {...props} />;
      case 9:  return <Step09Birthday {...props} />;
      case 10: return <Step10Goal {...props} />;
      case 11: return <Step11TargetWeight {...props} />;
      case 12: return <Step12Affirmation {...props} />;
      case 13: return <Step13Speed {...props} />;
      case 14: return <Step14Comparison {...props} />;
      case 15: return <Step15PainPoints {...props} />;
      case 16: return <Step16Diet {...props} />;
      case 17: return <Step17Accomplish {...props} />;
      case 18: return <Step18ProgressChart {...props} />;
      case 19: return <Step19Trust {...props} />;
      case 20: return <Step20Health {...props} />;
      case 21: return <Step21Reviews {...props} />;
      case 22: return <Step22Flexibility {...props} />;
      case 23: return <Step23Notifications {...props} />;
      case 24: return <Step24Referral {...props} />;
      case 25: return <Step25Account {...props} />;
      case 26: return <Step26PlanBuilding {...props} />;
      case 27: return <Step27PlanReady {...props} />;
      case 28: return <Step28Paywall {...props} />;
      case 29: return <Step29SpinWheel {...props} />;
      case 30: return <Step30PaywallDiscount {...props} />;
      default: return <Step01Splash {...props} />;
    }
  };

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.transitionWrap,
          { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {renderStep()}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  transitionWrap: {
    flex: 1,
  },
});

// ─── Tipos compartidos para todos los pasos ───────────────────────────────
export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  step: number;
  totalSteps: number;
}
