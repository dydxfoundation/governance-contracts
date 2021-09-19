import config from '../config';

export function log(
  ...args: {}[]
) {
  const shouldLogDefault = !config.isHardhat() || config.FORK_MAINNET;
  const shouldLog = config.DEPLOYMENT_LOGS !== null
    ? config.DEPLOYMENT_LOGS
    : shouldLogDefault;
  if (shouldLog) {
    console.log(...args);
  }
}
