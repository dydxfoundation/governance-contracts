import { DateTime } from 'luxon';

import config from '../config';
import { ONE_DAY_SECONDS } from '../lib/constants';
import baseConfig, { BaseConfig } from './base-config';
import hardhatConfig from './hardhat-config';
import mainnetForkConfig from './mainnet-fork-config';
import mainnetPhase1Config from './mainnet-phase-1-config';
import mainnetPhase2Config from './mainnet-phase-2-config';
import { DeployConfig, TreasuryVesterConfig } from './types';

/**
 * Get the deployment config.
 *
 * Must be wrapped in a function so that it can be evaluated after hardhat has been configured.
 */
export function getDeployConfig({
  getOldMainnetPhase1 = false,
  getOldMainnetPhase2 = false,
}: {
  getOldMainnetPhase1?: boolean,
  getOldMainnetPhase2?: boolean,
} = {}): DeployConfig {
  // Copy the base config.
  const deployConfig: BaseConfig & {
    EPOCH_ZERO_START?: DeployConfig['EPOCH_ZERO_START'],
    DYDX_COLLATERAL_TOKEN_ADDRESS?: DeployConfig['DYDX_COLLATERAL_TOKEN_ADDRESS'],
    STARK_PERPETUAL_ADDRESS?: DeployConfig['STARK_PERPETUAL_ADDRESS'],
  } = {
    ...baseConfig,
  };

  // Override parameters depending on the environment or deployment phase. This must include
  // setting the epoch zero start time, from which the rest of the schedule is derived.
  //
  // Note: Many contracts are not deployable unless the epoch zero start time is in the future.

  if (getOldMainnetPhase1) {
    Object.assign(deployConfig, mainnetPhase1Config);
  } else if (getOldMainnetPhase2) {
    Object.assign(deployConfig, mainnetPhase2Config);
  } else if (config.isHardhat()) {
    if (config.FORK_MAINNET) {
      Object.assign(deployConfig, mainnetForkConfig);
    } else {
      Object.assign(deployConfig, hardhatConfig);
    }
  } else if (config.isMainnet()) {
    Object.assign(deployConfig, mainnetPhase2Config);
  } else {
    // Need to add a new configuration file to set the value of EPOCH_ZERO_START.
    throw new Error('Deployment configuration is not known for this network.');
  }

  if (!deployConfig.EPOCH_ZERO_START) {
    throw new Error('EPOCH_ZERO_START was not set');
  }

  if (!deployConfig.DYDX_COLLATERAL_TOKEN_ADDRESS) {
    throw new Error('DYDX_COLLATERAL_TOKEN_ADDRESS was not set');
  }

  if (!deployConfig.STARK_PERPETUAL_ADDRESS) {
    throw new Error('STARK_PERPETUAL_ADDRESS was not set');
  }

  // Below: Derive all parameters which depend on the epoch zero start time.

  const TRANSFERS_RESTRICTED_BEFORE = (
    deployConfig.EPOCH_ZERO_START +
    deployConfig.EPOCH_LENGTH +
    deployConfig.MERKLE_DISTRIBUTOR_WAITING_PERIOD +
    ONE_DAY_SECONDS
  );

  const REWARDS_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
    VESTING_AMOUNT: deployConfig.REWARDS_TREASURY_VESTING_AMOUNT,
    VESTING_BEGIN: deployConfig.EPOCH_ZERO_START,
    VESTING_CLIFF: deployConfig.EPOCH_ZERO_START,
    VESTING_END: addFiveYears(deployConfig.EPOCH_ZERO_START),
  };

  const COMMUNITY_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
    VESTING_AMOUNT: deployConfig.COMMUNITY_TREASURY_VESTING_AMOUNT,
    VESTING_BEGIN: deployConfig.EPOCH_ZERO_START,
    VESTING_CLIFF: deployConfig.EPOCH_ZERO_START,
    VESTING_END: addFiveYears(deployConfig.EPOCH_ZERO_START),
  };

  return {
    ...deployConfig,

    // Token schedule parameters.
    EPOCH_ZERO_START: deployConfig.EPOCH_ZERO_START,
    TRANSFERS_RESTRICTED_BEFORE,
    TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN: TRANSFERS_RESTRICTED_BEFORE + 30 * ONE_DAY_SECONDS,
    MINTING_RESTRICTED_BEFORE: addFiveYears(TRANSFERS_RESTRICTED_BEFORE),

    // Staking schedule parameters.
    LS_DISTRIBUTION_START: deployConfig.EPOCH_ZERO_START,
    LS_DISTRIBUTION_END: deployConfig.EPOCH_ZERO_START + deployConfig.REWARDS_DISTRIBUTION_LENGTH,
    SM_DISTRIBUTION_START: TRANSFERS_RESTRICTED_BEFORE,
    SM_DISTRIBUTION_END: TRANSFERS_RESTRICTED_BEFORE + deployConfig.REWARDS_DISTRIBUTION_LENGTH,

    // Treasury parameters.
    REWARDS_TREASURY_VESTER_CONFIG,
    COMMUNITY_TREASURY_VESTER_CONFIG,

    // Liquidity staking + stark proxy parameters
    DYDX_COLLATERAL_TOKEN_ADDRESS: deployConfig.DYDX_COLLATERAL_TOKEN_ADDRESS,
    STARK_PERPETUAL_ADDRESS: deployConfig.STARK_PERPETUAL_ADDRESS,
  };
}

/**
 * Add five years to a timestamp. This adds (365 * 5) days plus 1 day for the leap year.
 */
function addFiveYears(
  timestamp: number,
): number {
  return DateTime.fromSeconds(timestamp).plus({ years: 5 }).toSeconds();
}
