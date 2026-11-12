// First-launch introduction: three swipeable slides, each with its own moving picture.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PulseRings, useLoop } from '@/lib/splash';
import { Button, colors, Pill, styles, type IconName } from '@/lib/ui';
import { markWelcomeSeen } from '@/lib/welcome';

const SLIDES = [
  {
    eyebrow: 'CLARITY FOR EVERY WATT',
    title: "Understand your home's energy, in real time.",
    text: 'See what each appliance is drawing right now, and how much it has used today.',
  },
  {
    eyebrow: 'NO MORE BILL SHOCK',
    title: 'Know your bill before it arrives.',
    text: 'ElecTrack projects your monthly energy charge using the verified VECO rate.',
  },
  {
    eyebrow: 'SMARTER HABITS',
    title: 'Let AI spot the waste for you.',
    text: 'Get alerts for unusual usage and practical tips based on your own patterns.',
  },
];

/** Runs 0 -> 1 once each time the slide becomes the visible one. */
function useEntrance(active: boolean, duration = 900) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.stopAnimation();
    value.setValue(0);
    if (active) Animated.timing(value, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [active, duration, value]);
  return value;
}

/** A number that counts up as `progress` goes 0 -> 1. */
function CountUp({ progress, to, format, style }: { progress: Animated.Value; to: number; format: (n: number) => string; style: object }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = progress.addListener(({ value }) => setShown(value * to));
    return () => progress.removeListener(id);
  }, [progress, to]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** Something that gently bobs up and down. */
function Float({ children, delay, style }: { children: React.ReactNode; delay: number; style?: object }) {
  const loop = useLoop(3200, delay);
  return (
    <Animated.View style={[style, { transform: [{ translateY: loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Slide 1: a plug sending out readings, with appliances floating around it.
function LiveArt({ active }: { active: boolean }) {
  const enter = useEntrance(active, 1400);
  const chip = (icon: IconName, watts: string, delay: number, position: object) => (
    <Float delay={delay} style={[art.chip, position]}>
      <Ionicons name={icon} size={16} color={colors.cyan} />
      <Text style={art.chipText}>{watts}</Text>
    </Float>
  );
  return (
    <View style={art.stage}>
      <View style={{ position: 'absolute', top: 14, left: 14 }}>
        <Pill text="LIVE MONITORING" tone="ok" icon="radio-outline" />
      </View>
      <PulseRings size={96} />
      <View style={art.core}>
        <Ionicons name="flash" size={34} color={colors.brand} />
      </View>
      {chip('snow-outline', '820 W', 0, { top: 40, right: 22 })}
      {chip('tv-outline', '85 W', 900, { top: 104, left: 16 })}
      {chip('laptop-outline', '25 W', 1800, { bottom: 26, right: 40 })}
      <View style={art.readout}>
        <CountUp progress={enter} to={930} format={(n) => `${Math.round(n)} W`} style={art.readoutValue} />
        <Text style={art.readoutLabel}>right now</Text>
      </View>
    </View>
  );
}

// Slide 2: a week of bars growing, then the projected bill sliding in.
const BARS = [0.45, 0.8, 0.7, 0.6, 0.5, 1, 0.9];
function BillArt({ active }: { active: boolean }) {
  const enter = useEntrance(active, 1500);
  return (
    <View style={art.stage}>
      <View style={art.chart}>
        {BARS.map((h, i) => {
          const from = i / (BARS.length + 3);
          const grow = enter.interpolate({ inputRange: [from, Math.min(1, from + 0.45)], outputRange: [0, h * 120], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[art.bar, { height: grow, backgroundColor: i === 5 ? colors.brand : colors.bar }]} />;
        })}
      </View>
      <Animated.View
        style={[
          art.billCard,
          {
            opacity: enter.interpolate({ inputRange: [0.45, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: enter.interpolate({ inputRange: [0.45, 0.9], outputRange: [26, 0], extrapolate: 'clamp' }) }],
          },
        ]}
      >
        <Text style={art.billLabel}>PROJECTED THIS MONTH</Text>
        <CountUp progress={enter} to={4680} format={(n) => `₱${Math.round(n).toLocaleString('en-US')}`} style={art.billValue} />
        <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          <Pill text="ESTIMATE" tone="info" />
        </View>
      </Animated.View>
    </View>
  );
}

// Slide 3: a slowly turning ring of sparks around the AI mark, with insight cards arriving.
function CoachArt({ active }: { active: boolean }) {
  const enter = useEntrance(active, 1500);
  const spin = useLoop(14000);
  const card = (index: number, icon: IconName, tint: string, title: string, text: string) => {
    const start = 0.25 + index * 0.25;
    return (
      <Animated.View
        style={[
          art.insight,
          {
            opacity: enter.interpolate({ inputRange: [start, start + 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateX: enter.interpolate({ inputRange: [start, start + 0.4], outputRange: [60, 0], extrapolate: 'clamp' }) }],
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={tint} />
        <View style={{ flex: 1 }}>
          <Text style={art.insightTitle}>{title}</Text>
          <Text style={art.insightText}>{text}</Text>
        </View>
      </Animated.View>
    );
  };
  return (
    <View style={art.stage}>
      <View style={art.orbitBox}>
        <Animated.View style={[art.orbit, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[art.spark, { transform: [{ rotate: `${i * 60}deg` }, { translateY: -58 }], opacity: i % 2 ? 0.4 : 1 }]} />
          ))}
        </Animated.View>
        <View style={art.core}>
          <Ionicons name="sparkles" size={32} color={colors.brand} />
        </View>
      </View>
      <View style={art.insights}>
        {card(0, 'analytics-outline', colors.amber, 'Unusual usage', 'Aircon ran 22 hours yesterday')}
        {card(1, 'leaf-outline', colors.brand, 'Saving tip', 'A timer could save ₱382 a month')}
      </View>
    </View>
  );
}

const ART = [LiveArt, BillArt, CoachArt];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef<any>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  async function finish(to: '/register' | '/login') {
    await markWelcomeSeen();
    router.replace(to);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function next() {
    if (last) return finish('/register');
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1); // for platforms that do not report the end of a programmatic scroll
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 20, height: 36, justifyContent: 'center' }}>
        {last ? null : (
          <Pressable onPress={() => finish('/login')} hitSlop={12}>
            <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '600' }}>Skip</Text>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => {
          const Art = ART[i];
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          // The picture and the words move at different speeds while swiping.
          const artStyle = {
            opacity: scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0] }),
            transform: [
              { scale: scrollX.interpolate({ inputRange: range, outputRange: [0.8, 1, 0.8] }) },
              { translateX: scrollX.interpolate({ inputRange: range, outputRange: [width * 0.25, 0, -width * 0.25] }) },
            ],
          };
          const textStyle = {
            opacity: scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0] }),
            transform: [{ translateX: scrollX.interpolate({ inputRange: range, outputRange: [width * 0.5, 0, -width * 0.5] }) }],
          };
          return (
            <View key={slide.title} style={{ width, paddingHorizontal: 20 }}>
              <Animated.View style={artStyle}>
                <Art active={page === i} />
              </Animated.View>
              <Animated.View style={[{ marginTop: 28 }, textStyle]}>
                <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>{slide.eyebrow}</Text>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', lineHeight: 34, marginTop: 10 }}>{slide.title}</Text>
                <Text style={[styles.body, { fontSize: 15, lineHeight: 22, marginTop: 12 }]}>{slide.text}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18, alignItems: 'center' }}>
          {SLIDES.map((_, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            return (
              <Animated.View
                key={i}
                style={{
                  width: 22,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.brand,
                  opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' }),
                  transform: [{ scaleX: scrollX.interpolate({ inputRange: range, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' }) }],
                }}
              />
            );
          })}
        </View>
        <Button title={last ? 'Get started' : 'Continue'} icon="arrow-forward" onPress={next} />
        <Text style={[styles.body, { textAlign: 'center', marginTop: 16 }]}>
          Already have an account?{' '}
          <Text style={{ color: colors.brand, fontWeight: '700' }} onPress={() => finish('/login')}>
            Sign in
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const art = StyleSheet.create({
  stage: {
    height: 330,
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  core: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: colors.accentCard,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  readout: { position: 'absolute', bottom: 18, left: 20 },
  readoutValue: { color: colors.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  readoutLabel: { color: colors.muted, fontSize: 11 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, height: 130, marginBottom: 124 },
  bar: { width: 18, borderRadius: 5 },
  billCard: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.accentCard,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  billLabel: { color: colors.sub, fontSize: 11, letterSpacing: 0.5 },
  billValue: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  orbitBox: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 118 },
  orbit: { position: 'absolute', width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  insights: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 8 },
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  insightText: { color: colors.sub, fontSize: 12, marginTop: 1 },
});
