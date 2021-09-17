/**
 * Deployment config overrides for development and test.
 *
 * Be careful about any overrides, since each override represents a difference between the test
 * and production environemtns.
 */

import { ONE_DAY_SECONDS } from '../constants';
import { TreasuryVesterConfig } from '../types';
import baseConfig, { DeployConfig } from './base-config';

const newEpochZeroStart = Math.floor(Date.now() / 1000) + ONE_DAY_SECONDS;
const diff = newEpochZeroStart - baseConfig.EPOCH_ZERO_START;

const REWARDS_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
  VESTING_AMOUNT: baseConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_AMOUNT,
  VESTING_BEGIN: baseConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_BEGIN + diff,
  VESTING_CLIFF: baseConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_CLIFF + diff,
  VESTING_END: baseConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_END + diff,
};

const COMMUNITY_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
  VESTING_AMOUNT: baseConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_AMOUNT,
  VESTING_BEGIN: baseConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_BEGIN + diff,
  VESTING_CLIFF: baseConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_CLIFF + diff,
  VESTING_END: baseConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_END + diff,
};

const hardhatConfig: Partial<DeployConfig> = {
  // Override EPOCH_ZERO_START and anything which depends on it.
  EPOCH_ZERO_START: baseConfig.EPOCH_ZERO_START + diff,
  TRANSFERS_RESTRICTED_BEFORE: baseConfig.TRANSFERS_RESTRICTED_BEFORE + diff,
  TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN: baseConfig.TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN + diff,
  MINTING_RESTRICTED_BEFORE: baseConfig.MINTING_RESTRICTED_BEFORE + diff,
  LS_DISTRIBUTION_START: baseConfig.LS_DISTRIBUTION_START + diff,
  LS_DISTRIBUTION_END: baseConfig.LS_DISTRIBUTION_END + diff,
  SM_DISTRIBUTION_START: baseConfig.SM_DISTRIBUTION_START + diff,
  SM_DISTRIBUTION_END: baseConfig.SM_DISTRIBUTION_END + diff,
  REWARDS_TREASURY_VESTER_CONFIG,
  COMMUNITY_TREASURY_VESTER_CONFIG,
};

export default hardhatConfig;
