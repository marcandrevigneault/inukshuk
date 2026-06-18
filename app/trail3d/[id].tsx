import { Trail3DGLScreen } from '@features/map/Trail3DGLScreen';
import { useLocalSearchParams } from 'expo-router';

export default function Trail3DRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Trail3DGLScreen trackId={id} />;
}
