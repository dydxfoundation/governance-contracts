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
} from '../lib/constants';
import { toWad } from '../lib/util';
import { TimelockConfig } from './types';

// Schedule parameters.
const EPOCH_LENGTH = 28 * ONE_DAY_SECONDS;
const BLACKOUT_WINDOW = 14 * ONE_DAY_SECONDS;
const MERKLE_DISTRIBUTOR_WAITING_PERIOD = 7 * ONE_DAY_SECONDS;

// Equal to 65 epochs plus a portion of an epoch, to account for leftover rewards due to the
// different start dates of the two staking modules.
const REWARDS_DISTRIBUTION_LENGTH = 157_679_998;

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
  DELAY: ONE_DAY_SECONDS * 7,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: ONE_DAY_SECONDS * 5,
  MAXIMUM_DELAY: ONE_DAY_SECONDS * 21,
  PROPOSITION_THRESHOLD: 200,
  VOTING_DURATION_BLOCKS: ONE_DAY_BLOCKS * 10,
  VOTE_DIFFERENTIAL: 1000,
  MINIMUM_QUORUM: 1000,
};

const SHORT_TIMELOCK_CONFIG: TimelockConfig = {
  DELAY: ONE_DAY_SECONDS * 2,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: ONE_DAY_SECONDS,
  MAXIMUM_DELAY: ONE_DAY_SECONDS * 7,
  PROPOSITION_THRESHOLD: 50,
  VOTING_DURATION_BLOCKS: ONE_DAY_BLOCKS * 4,
  VOTE_DIFFERENTIAL: 50,
  MINIMUM_QUORUM: 200,
};

const MERKLE_PAUSER_TIMELOCK_CONFIG: TimelockConfig = {
  DELAY: 0,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: 0,
  MAXIMUM_DELAY: ONE_DAY_SECONDS,
  PROPOSITION_THRESHOLD: 50,
  VOTING_DURATION_BLOCKS: ONE_DAY_BLOCKS * 2,
  VOTE_DIFFERENTIAL: 50,
  MINIMUM_QUORUM: 100,
};

const config = {
  // Common schedule parameters.
  EPOCH_LENGTH,
  BLACKOUT_WINDOW,
  REWARDS_DISTRIBUTION_LENGTH,

  // DYDX token parameters.
  MINT_MAX_PERCENT: 2,

  // Governance parameters.
  VOTING_DELAY_BLOCKS: 6570, // One day, assuming average block time of 13s.

  // Treasury parameters.
  REWARDS_TREASURY_VESTING_AMOUNT: new BNJS(toWad(450_000_000))
    .minus(REWARDS_TREASURY_FRONTLOADED_FUNDS)
    .toFixed(),
  COMMUNITY_TREASURY_VESTING_AMOUNT: toWad(50_000_000),

  // Timelock parameters.
  LONG_TIMELOCK_CONFIG,
  SHORT_TIMELOCK_CONFIG,
  MERKLE_PAUSER_TIMELOCK_CONFIG,

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
    TEST_TOKENS_1: {
      ADDRESS: '0xeb74327ddd3f0d359321f06d84a9d3871b4d96a4',
      AMOUNT: toWad(2),
    },
    TEST_TOKENS_2: {
      ADDRESS: '0xb03414a51a625e8ce16d284e34941ba66c5683c9',
      AMOUNT: toWad(2),
    },
    TEST_TOKENS_3: {
      ADDRESS: '0x1eec5afab429859c46db6552bc973bdd525fd7b1',
      AMOUNT: toWad(2),
    },
    TEST_TOKENS_4: {
      ADDRESS: '0x69112552fac655bb76a3e0ee7779843451db02b6',
      AMOUNT: toWad(2),
    },
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

  // Addresses which were used on mainnet for token custody testing.
  TOKEN_TEST_ADDRESSES: [
    '0xeb74327ddd3f0d359321f06d84a9d3871b4d96a4',
    '0xb03414a51a625e8ce16d284e34941ba66c5683c9',
    '0x1eec5afab429859c46db6552bc973bdd525fd7b1',
    '0x69112552fac655bb76a3e0ee7779843451db02b6',
    '0x688134aefae00632d36754ca9f085bd25072e2f0',
    '0xb50309682298fecf08ea07792154fa26f05fd7e5',
    '0x49fae0a92272ec68583eb009f4c40bcf91b9010f',
    '0xad2955994fb189117478eec154153ba7d0f835ca',
  ],

  // Safety Module recovery.
  //
  // The owed amount is the amount that was initially staked and stuck in the Safety Module,
  // plus additional compensation.
  //
  // Compensation for each user is 10% of what they staked, rounded down to the nearest 1e-18 DYDX.
  // The total owed amount is calculated by summing the staked amounts and compensation amounts
  // for all users who staked to the Safety Module.
  //
  // Snapshot of staked balances taken on September 14, 2021 UTC. The last tx was on September 9.
  //
  SM_RECOVERY_OWED_AMOUNT: '173204761823871505252385', // About 173205 DYDX.
  //
  // Distribution start is unchanged from the mainnet deployment
  SM_RECOVERY_DISTRIBUTION_START: (
    DateTime.fromISO('2021-09-08T15:00:00', { zone: 'utc' }).toSeconds()
  ),
  //
  // Calculate the distribution end as follows:
  //
  //   25,000,000 - 15745.887438533773204745 DYDX are available as rewards once staking resumes.
  //   The rewards rate is unchanged at 0.1585489619 DYDX per second, so we can issue rewards for
  //   157580685 whole seconds.
  //
  //   Assuming for now that the earliest staking may resume (counting 18 days from when a proposal
  //   is created) is 2021-11-02T01:00:00 UTC, we arrive at the following time.
  //
  SM_RECOVERY_DISTRIBUTION_END: (
    DateTime.fromISO('2026-10-30T21:24:45', { zone: 'utc' }).toSeconds()
  ),
};

export type BaseConfig = typeof config;

export default config;
