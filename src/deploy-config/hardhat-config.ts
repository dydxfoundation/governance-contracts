/**
 * Deployment config overrides for development and test.
 *
 * Be careful about any overrides, since each override represents a difference between the test
 * and production environemtns.
 */

import { ONE_DAY_SECONDS } from '../lib/constants';
import baseConfig from './base-config';
import { DeployConfig } from './types';

const hardhatConfig: Partial<DeployConfig> = {
  EPOCH_ZERO_START: Math.floor(Date.now() / 1000) + ONE_DAY_SECONDS,
  VOTING_DELAY_BLOCKS: 50,
  LONG_TIMELOCK_CONFIG: {
    ...baseConfig.LONG_TIMELOCK_CONFIG,
    VOTING_DURATION_BLOCKS: 100,
  },
};

export default hardhatConfig;
