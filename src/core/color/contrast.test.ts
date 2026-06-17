import { contrastRatio, hexToRgb, parseColor, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('parses hex with and without a leading #', () => {
    expect(hexToRgb('#FF8800')).toEqual([255, 136, 0]);
    expect(hexToRgb('ff8800')).toEqual([255, 136, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('throws on a malformed hex color', () => {
    expect(() => hexToRgb('nope')).toThrow(/invalid hex/);
    expect(() => hexToRgb('#FFF')).toThrow();
  });

  it('parseColor accepts hex and rgb/rgba (MD3 defaults are rgba)', () => {
    expect(parseColor('#FF8800')).toEqual([255, 136, 0]);
    expect(parseColor('rgba(28, 27, 31, 1)')).toEqual([28, 27, 31]);
    expect(parseColor('rgb(255, 136, 0)')).toEqual([255, 136, 0]);
  });

  it('black-on-white is the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('identical colors are 1:1', () => {
    expect(contrastRatio('#3A3A3A', '#3A3A3A')).toBeCloseTo(1, 5);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 6);
  });

  it('orders luminance white > grey > black', () => {
    expect(relativeLuminance('#FFFFFF')).toBeGreaterThan(relativeLuminance('#808080'));
    expect(relativeLuminance('#808080')).toBeGreaterThan(relativeLuminance('#000000'));
  });
});
