/**
 * Deployment config overrides for development and test.
 *
 * Be careful about any overrides, since each override represents a difference between the test
 * and production environemtns.
 */

import { ONE_DAY_SECONDS } from '../lib/constants';
import { DeployConfig } from './types';

const hardhatConfig: Partial<DeployConfig> = {
  EPOCH_ZERO_START: Math.floor(Date.now() / 1000) + ONE_DAY_SECONDS,
};

export default hardhatConfig;
