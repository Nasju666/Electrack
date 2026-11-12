// The animated ElecTrack splash: energy rings radiating from the logo, a light
// sweeping across it, and the wordmark sliding together.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from './ui';

/** A value that runs 0 -> 1 forever. */
export function useLoop(duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay]);
  return value;
}

/** Rings that expand and fade, like a signal going out. */
export function PulseRings({ size, count = 3 }: { size: number; count?: number }) {
  const a = useLoop(2600, 0);
  const b = useLoop(2600, 850);
  const c = useLoop(2600, 1700);
  return (
    <>
      {[a, b, c].slice(0, count).map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: colors.brand,
            opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.6] }) }],
          }}
        />
      ))}
    </>
  );
}

export function Splash() {
  const enter = useRef(new Animated.Value(0)).current; // logo pops in
  const words = useRef(new Animated.Value(0)).current; // wordmark slides together
  const tagline = useRef(new Animated.Value(0)).current;
  const sweep = useLoop(1800, 500);
  const dots = [useLoop(900, 0), useLoop(900, 200), useLoop(900, 400)];

  useEffect(() => {
    Animated.sequence([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.timing(words, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tagline, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [enter, words, tagline]);

  const slide = (from: number) => ({
    opacity: words,
    transform: [{ translateX: words.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  return (
    <View style={s.screen}>
      <View style={s.glow} />
      <View style={s.center}>
        <PulseRings size={110} />
        <Animated.View style={[s.logo, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <Ionicons name="pulse" size={46} color={colors.brand} />
          <Animated.View
            style={[s.sweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-70, 130] }) }, { rotate: '18deg' }] }]}
          />
        </Animated.View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 34 }}>
        <Animated.Text style={[s.word, slide(-24)]}>Elec</Animated.Text>
        <Animated.Text style={[s.word, { color: colors.brand }, slide(24)]}>Track</Animated.Text>
      </View>
      <Animated.Text style={[s.tagline, { opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        SEE WHERE YOUR ENERGY GOES
      </Animated.Text>

      <View style={s.bottom}>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {dots.map((d, i) => (
            <Animated.View
              key={i}
              style={[s.dot, { opacity: d.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 1, 0.25] }), transform: [{ scale: d.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.3, 0.8] }) }] }]}
            />
          ))}
        </View>
        <Text style={s.connecting}>Connecting securely to your home</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(34,211,154,0.04)' },
  center: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.accentCard,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sweep: { position: 'absolute', top: -20, width: 26, height: 140, backgroundColor: 'rgba(255,255,255,0.10)' },
  word: { fontSize: 38, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  tagline: { fontSize: 12, color: colors.sub, letterSpacing: 1.6, marginTop: 10 },
  bottom: { position: 'absolute', bottom: 56, alignItems: 'center', gap: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  connecting: { fontSize: 11, color: colors.muted },
});
