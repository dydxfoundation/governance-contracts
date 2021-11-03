/**
 * Deployment config overrides for mainnet forking.
 *
 * Be careful about any overrides, since each override represents a difference between the test
 * and production environemtns.
 */

import mainnetConfig from './mainnet-config';
import mainnetPhase2Config from './mainnet-phase-2-config';
import { DeployConfig } from './types';

const hardhatConfig: Partial<DeployConfig> = {
  EPOCH_ZERO_START: mainnetPhase2Config.EPOCH_ZERO_START,
};

export default hardhatConfig;
