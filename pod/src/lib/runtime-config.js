const buildEnvironment = import.meta.env || {};
const runtimeEnvironment = typeof window !== 'undefined'
  ? (window.__PHILBO_RUNTIME_CONFIG__ || {})
  : {};

export const runtimeConfig = {
  ...buildEnvironment,
  ...runtimeEnvironment
};
