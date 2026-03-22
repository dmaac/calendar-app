import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Line,
  Polyline,
  G,
} from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg: '#FFFFFF',
  surface: '#F5F5F7',
  black: '#111111',
  gray: '#8E8E93',
  grayLight: '#E5E5EA',
  accent: '#4285F4',
  disabled: '#C7C7CC',
  white: '#FFFFFF',
};

// ─── Types ─────────────────────────────────────────────────────────────────
interface UserData {
  gender: string;
  workouts: string;
  source: string;
  usedOtherApps: string;
  heightFt: number;
  heightIn: number;
  weightLb: number;
  birthMonth: number;
  birthDay: number;
  birthYear: number;
  goal: string;
  targetWeight: number;
  speed: number;
  painPoints: string[];
  diet: string;
  accomplishments: string[];
  referralCode: string;
}

interface OnboardingScreenProps {
  onComplete: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const SPLASH = 0;
const WELCOME = 1;
const FIRST_PROGRESS_STEP = 2;
const TOTAL_PROGRESS_STEPS = 20; // steps 2-21

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const YEARS = Array.from({ length: 100 }, (_, i) => String(2006 - i));
const HEIGHTS_FT = ['3','4','5','6','7'];
const HEIGHTS_IN = ['0','1','2','3','4','5','6','7','8','9','10','11'];
const WEIGHTS_LB = Array.from({ length: 201 }, (_, i) => String(80 + i));

const SOURCES = [
  { label: 'App Store', icon: 'logo-apple-appstore' },
  { label: 'TikTok', icon: 'musical-notes' },
  { label: 'YouTube', icon: 'logo-youtube' },
  { label: 'TV', icon: 'tv' },
  { label: 'X / Twitter', icon: 'logo-twitter' },
  { label: 'Instagram', icon: 'logo-instagram' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
  { label: 'Friend / Family', icon: 'people' },
];

const PAIN_POINTS = [
  { label: 'Lack of consistency', icon: 'bar-chart' },
  { label: 'Unhealthy eating habits', icon: 'fast-food' },
  { label: 'Lack of support', icon: 'hand-left' },
  { label: 'Busy schedule', icon: 'calendar' },
  { label: 'Lack of meal inspiration', icon: 'nutrition' },
];

const DIETS = [
  { label: 'Classic', icon: 'restaurant' },
  { label: 'Pescatarian', icon: 'fish' },
  { label: 'Vegetarian', icon: 'leaf' },
  { label: 'Vegan', icon: 'flower' },
];

const ACCOMPLISHMENTS = [
  { label: 'Eat and live healthier', icon: 'nutrition' },
  { label: 'Boost my energy and mood', icon: 'sunny' },
  { label: 'Stay motivated and consistent', icon: 'fitness' },
  { label: 'Feel better about my body', icon: 'body' },
];

// ─── Scroll Picker Component ────────────────────────────────────────────────
const ITEM_HEIGHT = 48;

function ScrollPicker({
  items,
  selectedIndex,
  onSelect,
  width = 100,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [localIndex, setLocalIndex] = useState(selectedIndex);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setLocalIndex(clamped);
    onSelect(clamped);
  };

  return (
    <View style={{ width, height: ITEM_HEIGHT * 5, overflow: 'hidden' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: ITEM_HEIGHT * 2,
          left: 0,
          right: 0,
          height: ITEM_HEIGHT,
          backgroundColor: C.surface,
          borderRadius: 10,
          zIndex: 1,
        }}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{
          paddingTop: ITEM_HEIGHT * 2,
          paddingBottom: ITEM_HEIGHT * 2,
        }}
      >
        {items.map((item, i) => {
          const isSelected = i === localIndex;
          return (
            <View
              key={i}
              style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text
                style={{
                  fontSize: isSelected ? 20 : 16,
                  fontWeight: isSelected ? '600' : '400',
                  color: isSelected ? C.black : C.disabled,
                }}
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

// ─── Ruler Slider Component ─────────────────────────────────────────────────
const TICK_WIDTH = 10;

function RulerSlider({
  value,
  min,
  max,
  step = 0.5,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const ticks = Math.round((max - min) / step);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = Math.round((value - min) / step);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: idx * TICK_WIDTH, animated: false });
    }, 100);
  }, []);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / TICK_WIDTH);
    const newVal = min + idx * step;
    onChange(Math.min(max, Math.max(min, +newVal.toFixed(1))));
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>{unit}</Text>
      <Text style={{ fontSize: 38, fontWeight: '700', color: C.black, marginBottom: 12 }}>
        {value.toFixed(1)} {unit}
      </Text>
      <View style={{ position: 'relative', width: W - 48, height: 64 }}>
        {/* Center indicator */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (W - 48) / 2 - 1,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: C.black,
            zIndex: 10,
          }}
        />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_WIDTH}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          contentContainerStyle={{ paddingHorizontal: (W - 48) / 2 }}
        >
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const v = min + i * step;
            const isMajor = Math.round(v * 10) % 10 === 0;
            return (
              <View
                key={i}
                style={{ width: TICK_WIDTH, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 }}
              >
                <View
                  style={{
                    width: isMajor ? 2 : 1,
                    height: isMajor ? 36 : 22,
                    backgroundColor: isMajor ? C.black : C.grayLight,
                  }}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Small reusable components ──────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  const progress = (step - FIRST_PROGRESS_STEP) / (TOTAL_PROGRESS_STEPS - 1);
  return (
    <View style={{ height: 3, backgroundColor: C.grayLight, borderRadius: 2, marginHorizontal: 24, marginBottom: 8 }}>
      <View
        style={{
          height: 3,
          borderRadius: 2,
          backgroundColor: C.black,
          width: `${Math.min(100, Math.max(2, progress * 100))}%`,
        }}
      />
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.backBtn} activeOpacity={0.7}>
      <Ionicons name="chevron-back" size={20} color={C.black} />
    </TouchableOpacity>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
    >
      <Text style={[styles.primaryBtnText, disabled && styles.primaryBtnTextDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function OptionCard({
  label,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.optionCard, selected && styles.optionCardSelected]}
    >
      {icon ? (
        <Ionicons
          name={icon as any}
          size={20}
          color={selected ? C.white : C.black}
          style={{ marginRight: 12 }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.optionSubtitle, selected && { color: 'rgba(255,255,255,0.7)' }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected && <Ionicons name="checkmark" size={18} color={C.white} />}
    </TouchableOpacity>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────
function LongTermChart() {
  const cw = W - 80;
  const ch = 140;
  const pad = { t: 10, b: 30, l: 10, r: 10 };
  const gw = cw - pad.l - pad.r;
  const gh = ch - pad.t - pad.b;

  // Fitsi IA line: steady decline
  const calPoints = [
    [0, 0.1], [0.2, 0.25], [0.4, 0.42], [0.6, 0.58], [0.8, 0.72], [1, 0.85],
  ];
  // Traditional line: dip then rebound
  const tradPoints = [
    [0, 0.85], [0.2, 0.65], [0.4, 0.48], [0.6, 0.52], [0.8, 0.68], [1, 0.80],
  ];

  const toX = (x: number) => pad.l + x * gw;
  const toY = (y: number) => pad.t + (1 - y) * gh;

  const calPath = calPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toX(x)} ${toY(y)}`).join(' ');
  const tradPath = tradPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toX(x)} ${toY(y)}`).join(' ');

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>Your weight</Text>
      <Svg width={cw} height={ch}>
        {/* Grid line */}
        <Line x1={pad.l} y1={ch - pad.b} x2={cw - pad.r} y2={ch - pad.b} stroke={C.grayLight} strokeWidth={1} />
        {/* Fitsi IA line (black) */}
        <Path d={calPath} stroke={C.black} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Traditional line (red/salmon) */}
        <Path d={tradPath} stroke={C.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Start/end circles */}
        <Circle cx={toX(0)} cy={toY(0.1)} r={5} fill={C.white} stroke={C.black} strokeWidth={2} />
        <Circle cx={toX(1)} cy={toY(0.85)} r={5} fill={C.white} stroke={C.black} strokeWidth={2} />
        {/* Labels */}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: pad.l }}>
        <Text style={{ fontSize: 12, color: C.gray }}>Month 1</Text>
        <Text style={{ fontSize: 12, color: C.gray }}>Month 6</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 20, height: 2, backgroundColor: C.black, borderRadius: 1 }} />
          <Text style={{ fontSize: 12, color: C.gray }}>Our app</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 20, height: 2, backgroundColor: C.accent, borderRadius: 1 }} />
          <Text style={{ fontSize: 12, color: C.gray }}>Traditional diet</Text>
        </View>
      </View>
      <View style={styles.chartStat}>
        <Text style={{ fontSize: 13, color: C.black, textAlign: 'center' }}>
          80% of users maintain their weight loss even 6 months later
        </Text>
      </View>
    </View>
  );
}

function ComparisonChart() {
  return (
    <View style={styles.chartCard}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 24, paddingVertical: 16 }}>
        {/* Without */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, color: C.gray, textAlign: 'center' }}>Without{'\n'}our app</Text>
          <View style={{ width: 90, height: 60, backgroundColor: C.surface, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.gray }}>20%</Text>
          </View>
        </View>
        {/* With */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, color: C.black, textAlign: 'center' }}>With{'\n'}our app</Text>
          <View style={{ width: 90, height: 140, backgroundColor: C.black, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: C.white }}>2X</Text>
          </View>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: C.gray, textAlign: 'center', paddingHorizontal: 16 }}>
        Our app makes it easy and holds you accountable.
      </Text>
    </View>
  );
}

function ProgressChart() {
  const cw = W - 80;
  const ch = 160;
  const pad = { t: 20, b: 30, l: 20, r: 30 };
  const gw = cw - pad.l - pad.r;
  const gh = ch - pad.t - pad.b;

  const pts: [number, number][] = [[0, 0.05], [0.15, 0.08], [0.33, 0.12], [0.5, 0.25], [0.7, 0.55], [1.0, 0.92]];
  const toX = (x: number) => pad.l + x * gw;
  const toY = (y: number) => pad.t + (1 - y) * gh;

  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toX(x)} ${toY(y)}`).join(' ');
  const areaPath = `${linePath} L ${toX(1)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`;

  return (
    <View style={styles.chartCard}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: C.black, marginBottom: 8 }}>
        Your weight transition
      </Text>
      <Svg width={cw} height={ch}>
        <Defs>
          <LinearGradient id="prog" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4285F4" stopOpacity="0.3" />
            <Stop offset="1" stopColor="#4285F4" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#prog)" />
        <Path d={linePath} stroke={C.black} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.slice(1, 3).map(([x, y], i) => (
          <Circle key={i} cx={toX(x)} cy={toY(y)} r={5} fill={C.white} stroke={C.black} strokeWidth={2} />
        ))}
        <Circle cx={toX(1)} cy={toY(0.92)} r={10} fill={C.accent} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: -8, paddingHorizontal: pad.l }}>
        <Text style={{ fontSize: 12, color: C.gray }}>3 Days</Text>
        <Text style={{ fontSize: 12, color: C.gray }}>7 Days</Text>
        <Text style={{ fontSize: 12, color: C.gray }}>30 Days</Text>
      </View>
      <View style={styles.chartStat}>
        <Text style={{ fontSize: 13, color: C.black, textAlign: 'center' }}>
          Based on historical data, results are usually slow at first, but after 7 days, you can see real change!
        </Text>
      </View>
    </View>
  );
}

// ─── Main OnboardingScreen ──────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(SPLASH);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [userData, setUserData] = useState<UserData>({
    gender: '',
    workouts: '',
    source: '',
    usedOtherApps: '',
    heightFt: 5,
    heightIn: 6,
    weightLb: 150,
    birthMonth: 0,
    birthDay: 0,
    birthYear: 30,
    goal: '',
    targetWeight: 65,
    speed: 1.0,
    painPoints: [],
    diet: '',
    accomplishments: [],
    referralCode: '',
  });

  // Auto-advance splash
  useEffect(() => {
    if (step === SPLASH) {
      const t = setTimeout(() => goTo(WELCOME), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  const goTo = (nextStep: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(nextStep), 60);
  };

  const next = () => goTo(step + 1);
  const back = () => {
    if (step <= WELCOME) return;
    goTo(step - 1);
  };

  const set = <K extends keyof UserData>(key: K, val: UserData[K]) =>
    setUserData(prev => ({ ...prev, [key]: val }));

  const togglePainPoint = (label: string) => {
    setUserData(prev => ({
      ...prev,
      painPoints: prev.painPoints.includes(label)
        ? prev.painPoints.filter(p => p !== label)
        : [...prev.painPoints, label],
    }));
  };

  const toggleAccomplishment = (label: string) => {
    setUserData(prev => ({
      ...prev,
      accomplishments: prev.accomplishments.includes(label)
        ? prev.accomplishments.filter(a => a !== label)
        : [...prev.accomplishments, label],
    }));
  };

  const finish = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    await AsyncStorage.setItem('onboarding_data', JSON.stringify(userData));
    onComplete();
  };

  // Calculate BMI-based calorie estimate (rough)
  const heightCm = userData.heightFt * 30.48 + userData.heightIn * 2.54;
  const weightKg = userData.weightLb * 0.453592;
  const targetKg = userData.targetWeight;
  const weightDiff = Math.abs(weightKg - targetKg).toFixed(1);
  const estCalories = Math.round(10 * weightKg + 6.25 * heightCm - 5 * (2024 - (1920 + userData.birthYear * 0.8)) + 5);
  const dailyCals = Math.max(1200, Math.min(3000, estCalories - (userData.goal === 'Lose weight' ? 500 : 0)));
  const carbs = Math.round((dailyCals * 0.45) / 4);
  const protein = Math.round((dailyCals * 0.25) / 4);
  const fats = Math.round((dailyCals * 0.30) / 9);

  // ── Step renderers ────────────────────────────────────────────────────────

  const renderSplash = () => (
    <View style={styles.splashContainer}>
      <Ionicons name="calendar" size={52} color={C.black} />
      <Text style={styles.splashTitle}>Fitsi IA</Text>
    </View>
  );

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      <TouchableOpacity style={styles.langBtn} activeOpacity={0.7}>
        <Text style={styles.langText}>🌐 EN</Text>
      </TouchableOpacity>
      <View style={styles.welcomePhoneMock}>
        <View style={styles.phoneMockScreen}>
          <View style={styles.mockTopBar} />
          <View style={styles.mockContent}>
            <Ionicons name="calendar" size={36} color={C.white} />
            <Text style={styles.mockText}>Track your schedule & nutrition</Text>
          </View>
          <View style={styles.mockBottomBar} />
        </View>
      </View>
      <Text style={styles.welcomeTitle}>Calorie & schedule{'\n'}tracking made easy</Text>
      <View style={styles.welcomeActions}>
        <PrimaryButton label="Get Started" onPress={next} />
        <TouchableOpacity style={styles.signInLink} onPress={finish} activeOpacity={0.7}>
          <Text style={styles.signInText}>
            Already have an account?{' '}
            <Text style={{ fontWeight: '700' }}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGender = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choose your Gender</Text>
      <Text style={styles.stepSubtitle}>This will be used to calibrate your custom plan.</Text>
      <View style={{ gap: 12, marginTop: 40 }}>
        {['Male', 'Female', 'Other'].map(g => (
          <OptionCard
            key={g}
            label={g}
            selected={userData.gender === g}
            onPress={() => set('gender', g)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.gender} />
      </View>
    </View>
  );

  const renderWorkouts = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>How many workouts do{'\n'}you do per week?</Text>
      <Text style={styles.stepSubtitle}>This will be used to calibrate your custom plan.</Text>
      <View style={{ gap: 12, marginTop: 40 }}>
        {[
          { value: '0-2', sub: 'Workouts now and then' },
          { value: '3-5', sub: 'A few workouts per week' },
          { value: '6+', sub: 'Dedicated athlete' },
        ].map(item => (
          <OptionCard
            key={item.value}
            label={item.value}
            subtitle={item.sub}
            selected={userData.workouts === item.value}
            onPress={() => set('workouts', item.value)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.workouts} />
      </View>
    </View>
  );

  const renderSource = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Where did you hear{'\n'}about us?</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 10, marginTop: 24, paddingBottom: 100 }}>
          {SOURCES.map(src => (
            <OptionCard
              key={src.label}
              label={src.label}
              icon={src.icon}
              selected={userData.source === src.label}
              onPress={() => set('source', src.label)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.source} />
      </View>
    </View>
  );

  const renderOtherApps = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Have you tried other{'\n'}calorie tracking apps?</Text>
      <View style={{ gap: 12, marginTop: 48 }}>
        {[
          { value: 'No', icon: 'thumbs-down' },
          { value: 'Yes', icon: 'thumbs-up' },
        ].map(item => (
          <OptionCard
            key={item.value}
            label={item.value}
            icon={item.icon}
            selected={userData.usedOtherApps === item.value}
            onPress={() => set('usedOtherApps', item.value)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.usedOtherApps} />
      </View>
    </View>
  );

  const renderSocialProof = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Our app creates{'\n'}long-term results</Text>
      <View style={{ marginTop: 32 }}>
        <LongTermChart />
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderHeightWeight = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Height & weight</Text>
      <Text style={styles.stepSubtitle}>This will be used to calibrate your custom plan.</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 40, alignItems: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.pickerLabel}>Ft</Text>
          <ScrollPicker
            items={HEIGHTS_FT}
            selectedIndex={userData.heightFt - 3}
            onSelect={i => set('heightFt', i + 3)}
            width={70}
          />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.pickerLabel}>In</Text>
          <ScrollPicker
            items={HEIGHTS_IN}
            selectedIndex={userData.heightIn}
            onSelect={i => set('heightIn', i)}
            width={70}
          />
        </View>
        <View style={{ width: 1, height: 80, backgroundColor: C.grayLight, marginHorizontal: 8 }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.pickerLabel}>lb</Text>
          <ScrollPicker
            items={WEIGHTS_LB}
            selectedIndex={userData.weightLb - 80}
            onSelect={i => set('weightLb', i + 80)}
            width={90}
          />
        </View>
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderBirthday = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>When were you born?</Text>
      <Text style={styles.stepSubtitle}>This will be used to calibrate your custom plan.</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 40 }}>
        <ScrollPicker
          items={MONTHS}
          selectedIndex={userData.birthMonth}
          onSelect={i => set('birthMonth', i)}
          width={130}
        />
        <ScrollPicker
          items={DAYS}
          selectedIndex={userData.birthDay}
          onSelect={i => set('birthDay', i)}
          width={60}
        />
        <ScrollPicker
          items={YEARS}
          selectedIndex={userData.birthYear}
          onSelect={i => set('birthYear', i)}
          width={80}
        />
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderGoal = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What is your goal?</Text>
      <Text style={styles.stepSubtitle}>This helps us generate a plan for your calorie intake.</Text>
      <View style={{ gap: 12, marginTop: 48 }}>
        {['Lose weight', 'Maintain', 'Gain weight'].map(g => (
          <OptionCard
            key={g}
            label={g}
            selected={userData.goal === g}
            onPress={() => set('goal', g)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.goal} />
      </View>
    </View>
  );

  const renderTargetWeight = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What is your{'\n'}desired weight?</Text>
      <Text style={styles.stepSubtitle}>{userData.goal}</Text>
      <View style={{ marginTop: 60 }}>
        <RulerSlider
          value={userData.targetWeight}
          min={30}
          max={200}
          step={0.5}
          unit="kg"
          onChange={v => set('targetWeight', v)}
        />
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderAffirmation = () => (
    <View style={[styles.stepContainer, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={[styles.stepTitle, { textAlign: 'center' }]}>
        {'Losing '}
        <Text style={{ color: C.accent }}>{weightDiff} kg</Text>
        {' is a realistic\ntarget. It\'s not hard at all!'}
      </Text>
      <Text style={[styles.stepSubtitle, { textAlign: 'center', marginTop: 16 }]}>
        90% of users say that the change is obvious after using our app and it is not easy to rebound.
      </Text>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderSpeed = () => {
    const animals = ['🦥', '🐕', '🐆'];
    const speedIdx = userData.speed <= 0.4 ? 0 : userData.speed <= 1.0 ? 1 : 2;

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>How fast do you want{'\n'}to reach your goal?</Text>
        <View style={{ alignItems: 'center', marginTop: 48 }}>
          <Text style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>Loss weight speed per week</Text>
          <Text style={{ fontSize: 40, fontWeight: '700', color: C.black }}>
            {userData.speed.toFixed(1)} kg
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: W - 80, marginTop: 24 }}>
            {animals.map((a, i) => (
              <Text key={i} style={{ fontSize: 28, opacity: speedIdx === i ? 1 : 0.3 }}>{a}</Text>
            ))}
          </View>
          <View style={{ width: W - 80, marginTop: 8, position: 'relative' }}>
            <View style={{ height: 4, backgroundColor: C.grayLight, borderRadius: 2 }} />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: 4,
                width: `${((userData.speed - 0.1) / 1.4) * 100}%`,
                backgroundColor: C.black,
                borderRadius: 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: -10,
                left: `${((userData.speed - 0.1) / 1.4) * 100}%`,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: C.white,
                borderWidth: 2,
                borderColor: C.black,
                transform: [{ translateX: -12 }],
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: W - 80, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: C.gray }}>0.1 kg</Text>
            <Text style={{ fontSize: 12, color: C.gray }}>0.8 kg</Text>
            <Text style={{ fontSize: 12, color: C.gray }}>1.5 kg</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            {[0.3, 0.8, 1.5].map(v => (
              <TouchableOpacity
                key={v}
                onPress={() => set('speed', v)}
                style={[styles.speedChip, userData.speed === v && styles.speedChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.speedChipText, userData.speed === v && { color: C.white }]}>
                  {v === 0.8 ? '⭐ Recommended' : `${v} kg/wk`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.bottomAction}>
          <PrimaryButton label="Continue" onPress={next} />
        </View>
      </View>
    );
  };

  const renderProofComparison = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Lose twice as much{'\n'}weight with our app{'\n'}vs on your own</Text>
      <View style={{ marginTop: 24 }}>
        <ComparisonChart />
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderPainPoints = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's stopping you{'\n'}from reaching{'\n'}your goals?</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 10, marginTop: 24, paddingBottom: 100 }}>
          {PAIN_POINTS.map(p => (
            <OptionCard
              key={p.label}
              label={p.label}
              icon={p.icon}
              selected={userData.painPoints.includes(p.label)}
              onPress={() => togglePainPoint(p.label)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={userData.painPoints.length === 0} />
      </View>
    </View>
  );

  const renderDiet = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Do you follow a{'\n'}specific diet?</Text>
      <View style={{ gap: 12, marginTop: 40 }}>
        {DIETS.map(d => (
          <OptionCard
            key={d.label}
            label={d.label}
            icon={d.icon}
            selected={userData.diet === d.label}
            onPress={() => set('diet', d.label)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={!userData.diet} />
      </View>
    </View>
  );

  const renderAccomplish = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What would you like{'\n'}to accomplish?</Text>
      <View style={{ gap: 12, marginTop: 40 }}>
        {ACCOMPLISHMENTS.map(a => (
          <OptionCard
            key={a.label}
            label={a.label}
            icon={a.icon}
            selected={userData.accomplishments.includes(a.label)}
            onPress={() => toggleAccomplishment(a.label)}
          />
        ))}
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} disabled={userData.accomplishments.length === 0} />
      </View>
    </View>
  );

  const renderProgressChart = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>You have great potential{'\n'}to crush your goal</Text>
      <View style={{ marginTop: 32 }}>
        <ProgressChart />
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderTrust = () => (
    <View style={[styles.stepContainer, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={styles.trustIcon}>
        <Text style={{ fontSize: 56 }}>🙋</Text>
      </View>
      <Text style={[styles.stepTitle, { textAlign: 'center', marginTop: 24 }]}>
        Thank you for{'\n'}trusting us
      </Text>
      <Text style={[styles.stepSubtitle, { textAlign: 'center', marginTop: 12 }]}>
        Now let's personalize the app for you...
      </Text>
      <View style={styles.privacyBadge}>
        <Ionicons name="lock-closed" size={16} color={C.gray} />
        <View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.black }}>Your privacy and security matter to us.</Text>
          <Text style={{ fontSize: 12, color: C.gray }}>We promise to always keep your personal information private and secure.</Text>
        </View>
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderHealthConnect = () => (
    <View style={[styles.stepContainer, { alignItems: 'center' }]}>
      <View style={styles.healthIllustration}>
        <Text style={{ fontSize: 48 }}>❤️</Text>
        <View style={styles.appIconBubble}>
          <Ionicons name="calendar" size={28} color={C.white} />
        </View>
      </View>
      <Text style={[styles.stepTitle, { textAlign: 'center', marginTop: 32 }]}>
        Connect to{'\n'}Apple Health
      </Text>
      <Text style={[styles.stepSubtitle, { textAlign: 'center', marginTop: 8 }]}>
        Sync your daily activity between our app and the Health app to have the most thorough data.
      </Text>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
        <TouchableOpacity onPress={next} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={styles.skipText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderReferral = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Enter referral code{'\n'}(optional)</Text>
      <Text style={styles.stepSubtitle}>You can skip this step</Text>
      <View style={{ marginTop: 48 }}>
        <View style={styles.referralInput}>
          <TextInput
            style={styles.referralField}
            placeholder="Referral Code"
            placeholderTextColor={C.gray}
            value={userData.referralCode}
            onChangeText={v => set('referralCode', v)}
            autoCapitalize="none"
          />
          {userData.referralCode.length > 0 && (
            <TouchableOpacity
              style={styles.submitBtn}
              activeOpacity={0.8}
              onPress={() => {}}
            >
              <Text style={{ color: C.white, fontWeight: '600', fontSize: 14 }}>Submit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.bottomAction}>
        <PrimaryButton label="Continue" onPress={next} />
      </View>
    </View>
  );

  const renderPlanReady = () => {
    const year = new Date().getFullYear();
    const targetDate = new Date();
    const weeksNeeded = Math.ceil(parseFloat(weightDiff) / userData.speed);
    targetDate.setDate(targetDate.getDate() + weeksNeeded * 7);
    const dateStr = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    return (
      <View style={styles.stepContainer}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={28} color={C.white} />
          </View>
        </View>
        <Text style={[styles.stepTitle, { textAlign: 'center', fontSize: 22 }]}>
          Congratulations{'\n'}your custom plan is ready!
        </Text>
        <View style={styles.planTargetBadge}>
          <Text style={{ fontSize: 13, color: C.gray }}>You should {userData.goal.toLowerCase()}:</Text>
          <View style={styles.planTargetChip}>
            <Text style={{ fontSize: 13, color: C.black }}>
              {userData.goal} {weightDiff} kg by {dateStr}
            </Text>
          </View>
        </View>
        <View style={styles.planCard}>
          <Text style={styles.planCardTitle}>Daily recommendation</Text>
          <Text style={styles.planCardSub}>You can edit this anytime</Text>
          <View style={styles.macroGrid}>
            {[
              { label: 'Calories', value: String(dailyCals), color: C.black, unit: '' },
              { label: 'Carbs', value: String(carbs), color: '#F59E0B', unit: 'g' },
              { label: 'Protein', value: String(protein), color: '#EF4444', unit: 'g' },
              { label: 'Fats', value: String(fats), color: '#3B82F6', unit: 'g' },
            ].map(m => (
              <View key={m.label} style={styles.macroItem}>
                <Text style={styles.macroLabel}>{m.label}</Text>
                <View style={styles.macroCircle}>
                  <Text style={[styles.macroValue, { color: m.color }]}>{m.value}</Text>
                  {m.unit ? <Text style={{ fontSize: 11, color: m.color }}>{m.unit}</Text> : null}
                </View>
              </View>
            ))}
          </View>
          <View style={styles.healthScoreRow}>
            <Ionicons name="heart" size={16} color={C.accent} />
            <Text style={styles.healthScoreLabel}>Health Score</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: C.grayLight, borderRadius: 3, marginHorizontal: 8 }}>
              <View style={{ width: '70%', height: 6, backgroundColor: '#10B981', borderRadius: 3 }} />
            </View>
            <Text style={styles.healthScoreValue}>7/10</Text>
          </View>
        </View>
        <View style={styles.bottomAction}>
          <PrimaryButton label="Let's get started!" onPress={finish} />
        </View>
      </View>
    );
  };

  // ── Step dispatcher ────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0: return renderSplash();
      case 1: return renderWelcome();
      case 2: return renderGender();
      case 3: return renderWorkouts();
      case 4: return renderSource();
      case 5: return renderOtherApps();
      case 6: return renderSocialProof();
      case 7: return renderHeightWeight();
      case 8: return renderBirthday();
      case 9: return renderGoal();
      case 10: return renderTargetWeight();
      case 11: return renderAffirmation();
      case 12: return renderSpeed();
      case 13: return renderProofComparison();
      case 14: return renderPainPoints();
      case 15: return renderDiet();
      case 16: return renderAccomplish();
      case 17: return renderProgressChart();
      case 18: return renderTrust();
      case 19: return renderHealthConnect();
      case 20: return renderReferral();
      case 21: return renderPlanReady();
      default: return null;
    }
  };

  const showHeader = step >= FIRST_PROGRESS_STEP;
  const showBackBtn = step >= FIRST_PROGRESS_STEP;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      {step === SPLASH || step === WELCOME ? null : (
        <View style={styles.header}>
          {showBackBtn ? <BackButton onPress={back} /> : <View style={{ width: 36 }} />}
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <ProgressBar step={step} />
          </View>
          <View style={{ width: 36 }} />
        </View>
      )}
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {renderStep()}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Splash
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    gap: 12,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: C.black,
    letterSpacing: -0.5,
  },

  // Welcome
  welcomeContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  langBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.surface,
  },
  langText: { fontSize: 13, color: C.black },
  welcomePhoneMock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  phoneMockScreen: {
    width: W * 0.6,
    height: W * 0.85,
    backgroundColor: '#1C1C1E',
    borderRadius: 40,
    overflow: 'hidden',
    padding: 16,
    justifyContent: 'space-between',
  },
  mockTopBar: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
  },
  mockContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  mockText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  mockBottomBar: {
    height: 8,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    alignSelf: 'center',
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.black,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 24,
  },
  welcomeActions: { gap: 12, paddingBottom: 16 },
  signInLink: { alignItems: 'center', paddingVertical: 8 },
  signInText: { fontSize: 14, color: C.black },

  // Steps
  stepContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.black,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  stepSubtitle: {
    fontSize: 14,
    color: C.gray,
    marginTop: 8,
    lineHeight: 20,
  },

  // Option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  optionCardSelected: {
    backgroundColor: C.black,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: C.black,
  },
  optionLabelSelected: {
    color: C.white,
  },
  optionSubtitle: {
    fontSize: 12,
    color: C.gray,
    marginTop: 2,
  },

  // Button
  primaryBtn: {
    backgroundColor: C.black,
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: C.grayLight,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
  primaryBtnTextDisabled: {
    color: C.disabled,
  },
  bottomAction: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    gap: 8,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 10 },
  skipText: { fontSize: 15, fontWeight: '600', color: C.black },

  // Picker
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray,
    marginBottom: 8,
  },

  // Charts
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.black,
  },
  chartStat: {
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },

  // Speed
  speedChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
  },
  speedChipActive: { backgroundColor: C.black },
  speedChipText: { fontSize: 13, fontWeight: '500', color: C.black },

  // Trust
  trustIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 32,
  },

  // Health
  healthIllustration: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    position: 'relative',
  },
  appIconBubble: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.black,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Referral
  referralInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  referralField: {
    flex: 1,
    fontSize: 16,
    color: C.black,
    height: 52,
  },
  submitBtn: {
    backgroundColor: C.disabled,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },

  // Plan ready
  checkCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTargetBadge: { alignItems: 'center', marginTop: 12, gap: 8 },
  planTargetChip: {
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  planCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  planCardTitle: { fontSize: 15, fontWeight: '700', color: C.black },
  planCardSub: { fontSize: 12, color: C.gray, marginBottom: 16 },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  macroItem: {
    width: (W - 80) / 2,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
    gap: 8,
  },
  macroLabel: { fontSize: 12, color: C.gray },
  macroCircle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroValue: { fontSize: 24, fontWeight: '700' },
  healthScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  healthScoreLabel: { fontSize: 13, color: C.black },
  healthScoreValue: { fontSize: 13, fontWeight: '700', color: C.black },
});
