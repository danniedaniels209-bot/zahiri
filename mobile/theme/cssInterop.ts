import { cssInterop } from 'nativewind';
import Animated from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Teaches NativeWind how to style components it does not own.
 *
 * NativeWind maps `className` to `style` for React Native's own primitives.
 * Anything else — Reanimated's animated components, Expo's LinearGradient —
 * receives `className` as an unrecognised prop and silently drops it.
 *
 * On native this often goes unnoticed because the Babel plugin catches many
 * cases. On web it does not, and the result is a card with no background, no
 * padding and no border, or a row that stacks vertically because `flex-row`
 * never applied. Registering the components here fixes it once for every call
 * site rather than forcing inline styles throughout the app.
 *
 * Imported for its side effects at the top of the root layout, before any
 * screen renders.
 */

cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });
cssInterop(Animated.Image, { className: 'style' });

cssInterop(Animated.ScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});

cssInterop(LinearGradient, { className: 'style' });

/**
 * The animated Pressable used for cards and buttons. Created and registered
 * here so there is exactly one instance, already interop-aware, shared by every
 * component that needs it.
 */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

cssInterop(AnimatedPressable, { className: 'style' });
