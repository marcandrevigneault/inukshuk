import type { RecorderStatus } from '@state/recorderStore';
import { StyleSheet, View } from 'react-native';
import { FAB, useTheme } from 'react-native-paper';

interface RecordControlsProps {
  status: RecorderStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/** Primary recording controls: start, or pause/resume + stop while active. */
export function RecordControls({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordControlsProps) {
  const theme = useTheme();

  if (status === 'idle') {
    return (
      <FAB
        icon="record-circle"
        label="Record"
        onPress={onStart}
        color={theme.colors.onTertiary}
        style={[styles.recordFab, { backgroundColor: theme.colors.tertiary }]}
      />
    );
  }

  return (
    <View style={styles.activeRow}>
      <FAB
        icon="stop"
        size="medium"
        onPress={onStop}
        color={theme.colors.onError}
        style={{ backgroundColor: theme.colors.error }}
      />
      {status === 'recording' ? (
        <FAB
          icon="pause"
          label="Pause"
          onPress={onPause}
          color={theme.colors.onTertiary}
          style={{ backgroundColor: theme.colors.tertiary }}
        />
      ) : (
        <FAB
          icon="play"
          label="Resume"
          onPress={onResume}
          color={theme.colors.onPrimary}
          style={{ backgroundColor: theme.colors.primary }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recordFab: {
    borderRadius: 28,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
