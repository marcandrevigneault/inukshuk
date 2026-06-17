import { TrackEditScreen } from '@features/library/TrackEditScreen';
import { useLocalSearchParams } from 'expo-router';

export default function TrailEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrackEditScreen trackId={id} />;
}
