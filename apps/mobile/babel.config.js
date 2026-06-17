// Expo's babel preset handles Expo Router (SDK 50+) and the `@/` alias via
// tsconfig paths, so no extra plugins are required here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
