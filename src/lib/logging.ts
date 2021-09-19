import config from '../config';

export function log(
  ...args: {}[]
) {
  if (!config.isHardhat() || config.HARDHAT_VERBOSE_LOGGING) {
    console.log(...args);
  }
}
