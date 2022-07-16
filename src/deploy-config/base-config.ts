/**
 * Configuration values for the mainnet deployment, used as the defaults for other deployments.
 *
 * Time periods and timestamps are in seconds unless otherwise indicated.
 */

import { bytes } from '@project-serum/anchor/dist/cjs/utils';
import BNJS from 'bignumber.js';
import { DateTime } from 'luxon';

import {
  ONE_DAY_BLOCKS,
  ONE_DAY_SECONDS,
} from '../lib/constants';
import { toWad } from '../lib/util';
import { TimelockConfig, MerkleDistributorConfig, StarkProxyConfig } from './types';

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

const STARKWARE_CONFIG: TimelockConfig = {
  DELAY: ONE_DAY_SECONDS * 9,
  GRACE_PERIOD: ONE_DAY_SECONDS * 7,
  MINIMUM_DELAY: ONE_DAY_SECONDS * 4,
  MAXIMUM_DELAY: ONE_DAY_SECONDS * 21,
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

const MERKLE_DISTRIBUTOR_CONFIG: MerkleDistributorConfig = {
  IPNS_NAME: 'rewards-data.dydx.foundation',
  IPFS_UPDATE_PERIOD: 60 * 3,  // 3 minutes
  MARKET_MAKER_REWARDS_AMOUNT: 1_150_685,
  TRADER_REWARDS_AMOUNT: 3_835_616,
  TRADER_SCORE_ALPHA: 0.7,
};

const STARK_PROXY_CONFIG: StarkProxyConfig = {
  BORROWER_CONFIGS: [
    {
      // Wintermute
      BORROWER_ADDRESS: '0x4f3a120E72C76c22ae802D129F599BFDbc31cb81',
      BORROWER_ALLOCATION: 2500,
    },
    {
      // Amber
      BORROWER_ADDRESS: '0x39ad99e33ab7ee85818741dd6076112188bc2611',
      BORROWER_ALLOCATION: 2500,
    },
    {
      // Sixtant
      BORROWER_ADDRESS: '0x89ded350b2be3dc2014c71f1e49cdfad17ccaf7c',
      BORROWER_ALLOCATION: 2000,
    },
    {
      // Kronos
      BORROWER_ADDRESS: '0x38d981c3c42b2ec8e9572f560552407d0f1279fb',
      BORROWER_ALLOCATION: 2000,
    },
    {
      // DAT Trading
      BORROWER_ADDRESS: '0x940ab7307c7971f9284ba9c19b3313600d79c48a',
      BORROWER_ALLOCATION: 1000,
    },
  ],
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
  STARKWARE_CONFIG,
  MERKLE_PAUSER_TIMELOCK_CONFIG,

  // Merkle Distributor.
  MERKLE_DISTRIBUTOR_CONFIG,
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

  // Stark Proxies.
  STARK_PROXY_CONFIG,

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

  // dYdX Grants Program.
  // Amount to be transferred is $6,250,000 of DYDX at market.
  // Per the DIP, price has been calculated using 24h VWAP from market data.
  // Price derived is $8.31 using Binance.com DYDX/USDT on 01/01/22.
  // Using market price of $8.31, rounded amount to be transferred is 752,000.00 DYDX.
  //
  DGP_MULTISIG_ADDRESS: '0xFa3811E5C92358133330f9F787980ba1e8E0D99a',
  //
  DGP_FUNDING_AMOUNT: '752000000000000000000000',

  // New Assets Proposal.
  // Arrays of assetIds and configuration hashes to implement the assets.
  // In order, the assets being added are:
  // ['APE', 'GMT', 'FTM', 'AX', 'OP', 'WAVES', 'GALA', 'SAND', 'MANA', 'SHIB', 'THETA', 'RSR', 'ZIL', 'VET', 'ENS']
  NEW_ASSET_IDS: ["0x4150452d3700000000000000000000","0x474d542d3600000000000000000000","0x46544d2d3600000000000000000000","0x4158532d3700000000000000000000","0x4f502d360000000000000000000000","0x57415645532d370000000000000000","0x47414c412d35000000000000000000","0x53414e442d36000000000000000000","0x4d414e412d36000000000000000000","0x534849422d31000000000000000000","0x54484554412d360000000000000000","0x5253522d3400000000000000000000","0x5a494c2d3400000000000000000000","0x5645542d3400000000000000000000","0x454e532d3700000000000000000000"],
  NEW_ASSET_HASHES: ["0x04bcd16be21334d87d1e40733646d6c5fd2d922d7296ed6420b72738d916d0eb","0x045e196a2ee8e835f35841f88de06c95e27f6382754f278fdf6a94010e47aab6","0x041f3ffa383871e70a28b0d7c349f7316259a27bb346dcb614e3299f40db4bca","0x05eecdd4f79a8e49915e9926ac328a0a2bf428e6142473c8ef5db1fb4306ae8d","0x02daa12a9a490a549acb84b847b88bb64e22310a78716c8f647f6fc60f230eb9","0x0245131a1c266f9b9fd46adcf45293abc62b96e2b505620aa8a3e00177cd371c","0x026c0659f8f4b33321c3ef68bed0affd51b4bf0ef86d8f9c545c12418116928d","0xbf30b882e6181da5baee2daf31fa3b9b0e19a1705a348dce001607f982ad3400","0x061334c7b3ca619e7e5d2335957c77ca24dc6b083172df07698219cc161a077b","0x079580a2876075d4f1d1cb00cc71cb13ccdae9156982ceeff36dcdadb9c5880a","0x03cefdb2702391d42fc7a74277bd472f8a9a98b94df0de8cb248f09a909ad795","0x04382e8bf00ae1c5374699325e4fbfa3c771551a4ab537f7233df4a1dcbc7e73","0x06f78a0f2ffba3874e09dbe780a62f5e9bdc25b5ccd3a0367e8b0c0528446361","0x024b0bbd6bbae392d348979036d5825e92aa124c405c1c570b2edd9c8b432136","0x02f4d8a30a0a499e10263028e0631ff9f4d26b504550c988e00f0ae18d9f8450"],
};

export type BaseConfig = typeof config;

export default config;