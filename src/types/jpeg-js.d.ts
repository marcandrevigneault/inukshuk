declare module 'jpeg-js' {
  interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
  }
  const jpeg: {
    decode(data: ArrayBuffer | Uint8Array, opts?: { useTArray?: boolean }): RawImageData;
  };
  export default jpeg;
}
