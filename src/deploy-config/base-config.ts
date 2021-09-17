/**
 * Configuration values for the mainnet deployment, used as the defaults for other deployments.
 *
 * Time periods and timestamps are in seconds unless otherwise indicated.
 */

import BNJS from 'bignumber.js';
import { DateTime } from 'luxon';

import {
  ONE_DAY_BLOCKS,
  ONE_DAY_SECONDS,
  ONE_YEAR_SECONDS,
} from '../constants';
import { TimelockConfig, TreasuryVesterConfig } from '../types';
import { toWad } from '../util';

// The mainnet start time of epoch zero.
const EPOCH_ZERO_START_UTC = '2021-08-03T15:00:00';
const EPOCH_ZERO_START = DateTime.fromISO(EPOCH_ZERO_START_UTC, { zone: 'utc' }).toSeconds();

// Schedule parameters.
const EPOCH_LENGTH = 28 * ONE_DAY_SECONDS;
const BLACKOUT_WINDOW = 14 * ONE_DAY_SECONDS;
const MERKLE_DISTRIBUTOR_WAITING_PERIOD = 7 * ONE_DAY_SECONDS;
const TRANSFERS_RESTRICTED_BEFORE = (
  EPOCH_ZERO_START +
  EPOCH_LENGTH +
  MERKLE_DISTRIBUTOR_WAITING_PERIOD +
  ONE_DAY_SECONDS
);

// Equal to 65 epochs plus a portion of an epoch, to account for leftover rewards due to the
// different start dates of the two staking modules.
export const REWARDS_DISTRIBUTION_LENGTH = 157_679_998;

// Staking parameters.
//
// Equal to 25M tokens per staking module divided by 157,679,998 seconds of distributing rewards
const STAKING_REWARDS_PER_SECOND = toWad('0.1585489619');

// Treasury parameters.
//
// Frontloaded rewards is sum of:
//   - 75M (retroactive distribution)
//   - 383,562 (epoch 0 Liquidity Module rewards)
//   - 3,835,616 (epoch 0 trader rewards)
//   - 1,150,685 (epoch 0 liquidity provider rewards)
const REWARDS_TREASURY_FRONTLOADED_FUNDS = toWad(
  75_000_000 +
  383_562 +
  3_835_616 +
  1_150_685,
);

const LONG_TIMELOCK_CONFIG: TimelockConfig = {
  DELAY: ONE_DAY_SECONDS * 2,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: ONE_DAY_SECONDS,
  MAXIMUM_DELAY: ONE_DAY_SECONDS * 7,
  PROPOSITION_THRESHOLD: 50,
  VOTING_DURATION: ONE_DAY_BLOCKS * 4,
  VOTE_DIFFERENTIAL: 50,
  MINIMUM_QUORUM: 200,
};

const SHORT_TIMELOCK_CONFIG: TimelockConfig = {
  DELAY: ONE_DAY_SECONDS * 7,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: ONE_DAY_SECONDS * 5,
  MAXIMUM_DELAY: ONE_DAY_SECONDS * 21,
  PROPOSITION_THRESHOLD: 200,
  VOTING_DURATION: ONE_DAY_BLOCKS * 10,
  VOTE_DIFFERENTIAL: 1000,
  MINIMUM_QUORUM: 1000,
};

const MERKLE_PAUSER_TIMELOCK_CONFIG: TimelockConfig = {
  DELAY: 0,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: 0,
  MAXIMUM_DELAY: ONE_DAY_SECONDS,
  PROPOSITION_THRESHOLD: 50,
  VOTING_DURATION: ONE_DAY_BLOCKS * 2,
  VOTE_DIFFERENTIAL: 50,
  MINIMUM_QUORUM: 100,
};

const REWARDS_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
  VESTING_AMOUNT: new BNJS(toWad(450_000_000)).minus(REWARDS_TREASURY_FRONTLOADED_FUNDS).toFixed(),
  VESTING_BEGIN: EPOCH_ZERO_START,
  VESTING_CLIFF: EPOCH_ZERO_START,
  VESTING_END: EPOCH_ZERO_START + 5 * ONE_YEAR_SECONDS,
};

const COMMUNITY_TREASURY_VESTER_CONFIG: TreasuryVesterConfig = {
  VESTING_AMOUNT: toWad(50_000_000),
  VESTING_BEGIN: EPOCH_ZERO_START,
  VESTING_CLIFF: EPOCH_ZERO_START,
  VESTING_END: EPOCH_ZERO_START + 5 * ONE_YEAR_SECONDS,
};

const config = {
  // Main schedule parameters.
  EPOCH_ZERO_START,
  EPOCH_LENGTH,
  BLACKOUT_WINDOW,
  TRANSFERS_RESTRICTED_BEFORE,
  TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN: TRANSFERS_RESTRICTED_BEFORE + 30 * ONE_DAY_SECONDS,
  MINTING_RESTRICTED_BEFORE: TRANSFERS_RESTRICTED_BEFORE + 5 * ONE_YEAR_SECONDS,
  LS_DISTRIBUTION_START: EPOCH_ZERO_START,
  LS_DISTRIBUTION_END: EPOCH_ZERO_START + REWARDS_DISTRIBUTION_LENGTH,
  SM_DISTRIBUTION_START: TRANSFERS_RESTRICTED_BEFORE,
  SM_DISTRIBUTION_END: TRANSFERS_RESTRICTED_BEFORE + REWARDS_DISTRIBUTION_LENGTH,

  // DYDX token parameters.
  MINT_MAX_PERCENT: 2,

  // Governance parameters.
  VOTING_DELAY_BLOCKS: 6570, // One day, assuming average block time of 13s.

  // Timelock parameters.
  LONG_TIMELOCK_CONFIG,
  SHORT_TIMELOCK_CONFIG,
  MERKLE_PAUSER_TIMELOCK_CONFIG,

  // Treasury parameters.
  REWARDS_TREASURY_VESTER_CONFIG,
  COMMUNITY_TREASURY_VESTER_CONFIG,

  // Merkle Distributor.
  MERKLE_DISTRIBUTOR_WAITING_PERIOD,

  // Safety Module.
  SM_REWARDS_PER_SECOND: STAKING_REWARDS_PER_SECOND,

  // Liquidity Staking.
  LS_MIN_BLACKOUT_LENGTH: 3 * ONE_DAY_SECONDS,
  LS_MAX_EPOCH_LENGTH: 92 * ONE_DAY_SECONDS,
  LS_REWARDS_PER_SECOND: STAKING_REWARDS_PER_SECOND,
  getLiquidityStakingMinEpochLength() {
    return this.LS_MIN_BLACKOUT_LENGTH * 2;
  },
  getLiquidityStakingMaxBlackoutLength() {
    return this.LS_MAX_EPOCH_LENGTH / 2;
  },

  // Treasuries.
  REWARDS_TREASURY_FRONTLOADED_FUNDS,

  // Initial token allocations.
  TOKEN_ALLOCATIONS: {
    DYDX_FOUNDATION: {
      ADDRESS: '0xb4fbF1Cd41BB174ABeFf6001B85490b58b117B22',
      AMOUNT: toWad(293_355_248.288681),
    },
    DYDX_TRADING: {
      ADDRESS: '0xf95746B2c3D120B78Fd1Cb3f9954CB451c2163E4',
      AMOUNT: toWad(115_941_170.358637),
    },
    DYDX_LLC: {
      ADDRESS: '0xCc9507708a918b1d44Cf63FaB4E7B98b7517060f',
      AMOUNT: toWad(90_703_573.352682),
    },
  },
};

export type DeployConfig = typeof config;

export default config;
