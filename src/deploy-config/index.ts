import config from '../config';
import baseConfig, { DeployConfig } from './base-config';
import hardhatConfig from './hardhat-config';

export { DeployConfig } from './base-config';

/**
 * Get the deployment config.
 *
 * Must be wrapped in a function so that it can be evaluated after hardhat has been configured.
 */
export function getDeployConfig(): DeployConfig {
  const deployConfig = {
    ...baseConfig,
  };

  if (config.isHardhat()) {
    Object.assign(deployConfig, hardhatConfig);
  }

  return deployConfig;
}
