import Svg, { Rect } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

/** Stacked-stone inukshuk glyph (head, arms, two legs) — the app's waypoint mark. */
export function InukshukIcon({ size = 24, color = '#000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={9} y={2} width={6} height={4} rx={1} fill={color} />
      <Rect x={2.5} y={8} width={19} height={4} rx={1} fill={color} />
      <Rect x={6} y={14} width={4} height={8} rx={1} fill={color} />
      <Rect x={14} y={14} width={4} height={8} rx={1} fill={color} />
    </Svg>
  );
}
