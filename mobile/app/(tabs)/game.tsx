import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, Card, ConfidenceMeter, EmptyState, Loading, VerdictBadge } from '../../components/ui';
import { ServerBanner } from '../../components/ServerBanner';
import { api, type GameRoundCard } from '../../lib/api';
import { alpha, colors, spring, VERDICT } from '../../theme/tokens';

type Answer = 'verified' | 'false' | 'misleading';

interface SessionResult {
  sessionId: string;
  score: number;
  correctCount: number;
  total: number;
  accuracy: number;
  results: {
    roundId: string;
    claim: string;
    yourAnswer: Answer;
    correctAnswer: Answer;
    correct: boolean;
    pointsEarned: number;
    explanation: string;
  }[];
}

const CHOICES: { key: Answer; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'verified', label: 'True', icon: 'checkmark-circle' },
  { key: 'misleading', label: 'Misleading', icon: 'alert-circle' },
  { key: 'false', label: 'False', icon: 'close-circle' },
];

export default function Game() {
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<{ roundId: string; answer: Answer; msTaken: number }[]>([]);
  const [summary, setSummary] = useState<SessionResult | null>(null);
  const startedAt = useRef(Date.now());

  const rounds = useQuery({
    queryKey: ['game-rounds'],
    queryFn: () => api<{ rounds: GameRoundCard[]; season: string }>('/api/game/rounds?count=7'),
    enabled: playing,
    staleTime: 0,
  });

  const board = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () =>
      api<{ entries: { rank: number; name: string; totalScore: number }[] }>(
        '/api/game/leaderboard?limit=5',
      ),
  });

  const me = useQuery({
    queryKey: ['game-me'],
    queryFn: () =>
      api<{ rank: number | null; totalScore: number; sessions: number; playersInSeason: number }>(
        '/api/game/me',
      ),
  });

  const submit = useMutation({
    mutationFn: (payload: typeof answers) =>
      api<SessionResult>('/api/game/sessions', { method: 'POST', body: { answers: payload } }),
    onSuccess: (data) => {
      setSummary(data);
      setPlaying(false);
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      void qc.invalidateQueries({ queryKey: ['game-me'] });
      void qc.invalidateQueries({ queryKey: ['balance'] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const start = useCallback(async () => {
    setSummary(null);
    setAnswers([]);
    setIndex(0);
    setPlaying(true);
    startedAt.current = Date.now();
    await qc.invalidateQueries({ queryKey: ['game-rounds'] });
  }, [qc]);

  const answer = useCallback(
    (choice: Answer) => {
      const list = rounds.data?.rounds ?? [];
      const current = list[index];
      if (!current) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const next = [
        ...answers,
        { roundId: current._id, answer: choice, msTaken: Date.now() - startedAt.current },
      ];
      setAnswers(next);
      startedAt.current = Date.now();

      if (index + 1 >= list.length) submit.mutate(next);
      else setIndex((i) => i + 1);
    },
    [answers, index, rounds.data, submit],
  );

  // ---- Summary ------------------------------------------------------------
  if (summary) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-ink">
        <Animated.ScrollView
          className="flex-1 px-gutter"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          entering={FadeIn.duration(320)}
        >
          <View className="items-center py-7">
            <Text className="font-display text-chalk" style={{ fontSize: 52, letterSpacing: -2 }}>
              {summary.score}
            </Text>
            <Text className="font-medium text-chalk-soft" style={{ fontSize: 13 }}>
              points earned
            </Text>

            <View className="flex-row mt-5" style={{ gap: 24 }}>
              <Stat label="Correct" value={`${summary.correctCount}/${summary.total}`} />
              <Stat label="Accuracy" value={`${summary.accuracy}%`} />
            </View>
          </View>

          <Text
            className="font-semibold text-micro text-chalk-faint uppercase mb-3"
            style={{ letterSpacing: 1.2 }}
          >
            Round by round
          </Text>

          <View style={{ gap: 10 }}>
            {summary.results.map((r, i) => (
              <Card key={r.roundId} index={i}>
                <View className="flex-row items-start justify-between mb-2" style={{ gap: 10 }}>
                  <Text className="flex-1 font-medium text-chalk" style={{ fontSize: 14, lineHeight: 20 }}>
                    {r.claim}
                  </Text>
                  <Ionicons
                    name={r.correct ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={r.correct ? colors.zahiri : '#FF4757'}
                  />
                </View>

                <View className="flex-row items-center mb-2.5" style={{ gap: 8 }}>
                  <VerdictBadge verdict={r.correctAnswer} size="sm" />
                  {!r.correct ? (
                    <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
                      you said {VERDICT[r.yourAnswer].label.toLowerCase()}
                    </Text>
                  ) : (
                    <Text style={{ color: colors.zahiri, fontFamily: 'Inter_500Medium', fontSize: 11.5 }}>
                      +{r.pointsEarned} pts
                    </Text>
                  )}
                </View>

                <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5, lineHeight: 18 }}>
                  {r.explanation}
                </Text>
              </Card>
            ))}
          </View>

          <View className="mt-6" style={{ gap: 10 }}>
            <Button title="Play again" size="lg" icon="refresh" onPress={start} />
            <Button title="Back to menu" variant="secondary" onPress={() => setSummary(null)} />
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Playing ------------------------------------------------------------
  if (playing) {
    const list = rounds.data?.rounds ?? [];
    const current = list[index];

    if (rounds.isLoading || submit.isPending) {
      return (
        <SafeAreaView edges={['top']} className="flex-1 bg-ink px-gutter">
          <Loading label={submit.isPending ? 'Scoring your run' : 'Dealing your rounds'} />
        </SafeAreaView>
      );
    }

    if (rounds.isError || !current) {
      return (
        <SafeAreaView edges={['top']} className="flex-1 bg-ink px-gutter">
          <EmptyState
            icon="alert-circle-outline"
            title="Could not start the game"
            body="No rounds are available right now."
            action={<Button title="Back" variant="secondary" onPress={() => setPlaying(false)} />}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-ink">
        <View className="flex-1 px-gutter">
          {/* Progress */}
          <View className="flex-row items-center pt-2 pb-5" style={{ gap: 12 }}>
            <Pressable onPress={() => setPlaying(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.chalkSoft} />
            </Pressable>
            <View className="flex-1 flex-row" style={{ gap: 4 }}>
              {list.map((_, i) => (
                <View
                  key={i}
                  className="flex-1 rounded-pill"
                  style={{
                    height: 3,
                    backgroundColor: i <= index ? colors.zahiri : colors.inkHigh,
                  }}
                />
              ))}
            </View>
            <Text className="font-medium text-caption text-chalk-soft">
              {index + 1}/{list.length}
            </Text>
          </View>

          <ClaimCard key={current._id} round={current} />

          <View className="pb-6" style={{ gap: 9 }}>
            <Text
              className="font-semibold text-micro text-chalk-faint uppercase text-center mb-1"
              style={{ letterSpacing: 1.2 }}
            >
              What is your verdict?
            </Text>
            {CHOICES.map((c) => (
              <ChoiceButton key={c.key} choice={c} onPress={() => answer(c.key)} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Menu ---------------------------------------------------------------
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ink">
      <Animated.ScrollView
        className="flex-1 px-gutter"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-2 pb-5">
          <Text className="font-display text-h1 text-chalk" style={{ letterSpacing: -0.8 }}>
            Truth Hunters
          </Text>
          <Text className="font-sans text-body text-chalk-soft mt-1.5">
            Seven claims. Call each one. Beat the clock for bonus points.
          </Text>
        </View>

        <ServerBanner />

        <LinearGradient
          colors={[alpha(colors.zahiri, 0.18), alpha(colors.info, 0.06)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: alpha(colors.zahiri, 0.3),
            padding: 18,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="font-sans text-caption text-chalk-soft">Your season</Text>
              <Text className="font-display text-chalk" style={{ fontSize: 30, letterSpacing: -1 }}>
                {me.data?.totalScore ?? 0}
                <Text className="font-sans text-chalk-soft" style={{ fontSize: 13 }}> pts</Text>
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-sans text-caption text-chalk-soft">Rank</Text>
              <Text className="font-display text-chalk" style={{ fontSize: 30, letterSpacing: -1 }}>
                {me.data?.rank ? `#${me.data.rank}` : '—'}
              </Text>
            </View>
          </View>
          <Button title="Start a run" size="lg" icon="play" onPress={start} />
        </LinearGradient>

        <Text
          className="font-semibold text-micro text-chalk-faint uppercase mt-7 mb-3"
          style={{ letterSpacing: 1.2 }}
        >
          Season leaderboard
        </Text>

        {board.isLoading ? (
          <Loading label="Loading leaderboard" />
        ) : (board.data?.entries.length ?? 0) === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title="No scores yet"
            body="Play the first run of the season."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {board.data!.entries.map((e, i) => (
              <Card key={e.rank} index={i} className="flex-row items-center">
                <Text
                  className="font-display text-chalk-faint"
                  style={{ fontSize: 17, width: 34 }}
                >
                  {e.rank}
                </Text>
                <Text className="flex-1 font-medium text-chalk" style={{ fontSize: 14.5 }}>
                  {e.name}
                </Text>
                <Text style={{ color: colors.zahiri, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                  {e.totalScore}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/** The claim being judged. Slides out to the left as the next one enters. */
function ClaimCard({ round }: { round: GameRoundCard }) {
  const difficultyColor =
    round.difficulty === 'hard' ? '#FF4757' : round.difficulty === 'medium' ? '#FFB020' : colors.zahiri;

  return (
    <Animated.View
      entering={FadeInDown.duration(380).springify()}
      exiting={SlideOutLeft.duration(220)}
      className="flex-1 justify-center"
    >
      <View
        className="rounded-card p-6"
        style={{
          backgroundColor: colors.inkRaised,
          borderWidth: 1,
          borderColor: colors.inkEdge,
        }}
      >
        <View className="flex-row items-center mb-5" style={{ gap: 8 }}>
          <View
            className="rounded-pill px-2.5 py-1"
            style={{ backgroundColor: alpha(difficultyColor, 0.16) }}
          >
            <Text
              style={{
                color: difficultyColor,
                fontFamily: 'Inter_600SemiBold',
                fontSize: 10,
                letterSpacing: 0.8,
              }}
            >
              {round.difficulty.toUpperCase()}
            </Text>
          </View>
          <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
            {round.topic}
          </Text>
        </View>

        <Text
          className="font-display-medium text-chalk"
          style={{ fontSize: 22, lineHeight: 31, letterSpacing: -0.4 }}
        >
          {round.claim}
        </Text>

        {round.context ? (
          <Text className="font-sans text-chalk-soft mt-4" style={{ fontSize: 13.5, lineHeight: 20 }}>
            {round.context}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function ChoiceButton({
  choice,
  onPress,
}: {
  choice: { key: Answer; label: string; icon: keyof typeof Ionicons.glyphMap };
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = VERDICT[choice.key].color;

  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, spring);
        }}
        onPressOut={() => {
          scale.value = withSequence(withSpring(1.02, spring), withSpring(1, spring));
        }}
        onPress={onPress}
        className="flex-row items-center justify-center rounded-pill py-4"
        style={{
          backgroundColor: alpha(tint, 0.13),
          borderWidth: 1,
          borderColor: alpha(tint, 0.4),
          gap: 8,
        }}
      >
        <Ionicons name={choice.icon} size={19} color={tint} />
        <Text style={{ color: tint, fontFamily: 'Inter_600SemiBold', fontSize: 15.5 }}>
          {choice.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="font-display text-chalk" style={{ fontSize: 22 }}>
        {value}
      </Text>
      <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
        {label}
      </Text>
    </View>
  );
}
