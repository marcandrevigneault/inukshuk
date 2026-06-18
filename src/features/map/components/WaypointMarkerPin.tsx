import { mapColors } from '@ui/theme';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { InukshukIcon } from './InukshukIcon';

interface Props {
  /** Whether the waypoint has a photo attached (shows a small camera badge). */
  hasPhoto?: boolean;
}

/**
 * Live recording waypoint marker: an inukshuk glyph in a round badge with a
 * downward pointer whose tip sits on the dropped coordinate (anchor="bottom").
 */
export function WaypointMarkerPin({ hasPhoto }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.badge}>
        <InukshukIcon size={20} color="#ffffff" />
        {hasPhoto && (
          <View style={styles.photoDot}>
            <Icon source="camera" size={9} color="#ffffff" />
          </View>
        )}
      </View>
      <View style={styles.pointer} />
    </View>
  );
}

const BADGE = 34;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: mapColors.userLocation,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDot: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#2b2b2b',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Triangle pointing down; its tip aligns with the marker coordinate.
  pointer: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
  },
});
