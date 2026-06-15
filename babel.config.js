module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo wires up expo-router and (when installed)
    // react-native-reanimated / worklets automatically.
    presets: ['babel-preset-expo'],
  };
};
