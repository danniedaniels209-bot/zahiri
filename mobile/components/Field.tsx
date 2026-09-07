import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { alpha, colors } from '../theme/tokens';

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
}

export function Field({ label, error, hint, icon, secure, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const borderColor = error
    ? alpha('#FF4757', 0.6)
    : focused
      ? alpha(colors.zahiri, 0.6)
      : colors.inkEdge;

  return (
    <View>
      <Text className="font-medium text-caption text-chalk-soft mb-2">{label}</Text>

      <View
        className="flex-row items-center rounded-2xl px-4"
        style={{
          height: 52,
          backgroundColor: colors.inkRaised,
          borderWidth: 1,
          borderColor,
          gap: 10,
        }}
      >
        {icon ? (
          <Ionicons name={icon} size={17} color={focused ? colors.zahiri : colors.chalkFaint} />
        ) : null}

        <TextInput
          className="flex-1"
          placeholderTextColor={colors.chalkFaint}
          selectionColor={colors.zahiri}
          secureTextEntry={secure && !reveal}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            color: colors.chalk,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            height: '100%',
          }}
          {...rest}
        />

        {secure ? (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={10}>
            <Ionicons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.chalkFaint}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text className="font-sans mt-1.5" style={{ color: '#FF7784', fontSize: 12 }}>
          {error}
        </Text>
      ) : hint ? (
        <Text className="font-sans text-chalk-faint mt-1.5" style={{ fontSize: 12 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
