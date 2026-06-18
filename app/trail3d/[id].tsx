import { Trail3DScreen } from '@features/map/Trail3DScreen';
import { useLocalSearchParams } from 'expo-router';

export default function Trail3DRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Trail3DScreen trackId={id} />;
}
