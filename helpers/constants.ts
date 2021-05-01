import BNJS from 'bignumber.js';
import { BigNumber } from 'ethers';

import { eEthereumNetwork, tEthereumAddress } from './types';
import { getParamPerNetwork } from './misc-utils';

export const MAX_UINT_AMOUNT =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const MOCK_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const WAD = Math.pow(10, 18).toString();
export const COOLDOWN_SECONDS = '3600'; // 1 hour in seconds
export const UNSTAKE_WINDOW = '1800'; // 30 min in seconds
export const DISTRIBUTION_DURATION = '86400'; // 1 day in seconds

export const STAKED_DYDX_NAME = 'Staked DYDX';
export const STAKED_DYDX_SYMBOL = 'staked-DYDX'; // TODO
export const STAKED_DYDX_DECIMALS = 18;

export const DYDX_GOVERNANCE = '0xEC568fffba86c094cf06b22134B23074DFE2252c';
export const UPGRADABLE_CRP_FACTORY = '0x1156C30b08DbF16281c803EAe0d52Eee7652f10C';
export const DYDX_TOKEN = '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9';
export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
export const REWARDS_VAULT = '0x25f2226b597e8f9514b3f68f00f494cf4f286491';
export const BPOOL_FACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd';

export const CRP_IMPLEMENTATION = '0xadc74a134082ea85105258407159fbb428a73782';
export const SHORT_EXECUTOR = '0xee56e2b3d491590b5b31738cc34d5232f378a8d5';
export const LONG_EXECUTOR = '0x61910EcD7e8e942136CE7Fe7943f956cea1CC2f7';
export const PROXY_CRP_ADMIN = SHORT_EXECUTOR;
export const RESERVE_CONTROLER = '0x1E506cbb6721B83B1549fa1558332381Ffa61A93';
export const ZERO_ADDRESS: tEthereumAddress = '0x0000000000000000000000000000000000000000';

// LiquidityStakingV1 constants.
export const EPOCH_LENGTH: BigNumber = BigNumber.from(60 * 60 * 24 * 28); // 28 day epoch length
export const BLACKOUT_WINDOW: BigNumber = BigNumber.from(60 * 60 * 24 * 7); // 7 day blackout window
export const MIN_BLACKOUT_LENGTH: BigNumber = BigNumber.from(60 * 60 * 24 * 3); // 3 days.
export const MIN_EPOCH_LENGTH: BigNumber = MIN_BLACKOUT_LENGTH.mul(2); // 6 days.
export const MAX_EPOCH_LENGTH: BigNumber = BigNumber.from(60 * 60 * 24 * 92); // 92 days.
export const MAX_BLACKOUT_LENGTH: BigNumber = MAX_EPOCH_LENGTH.div(2); // 42 days.
export const SHORTFALL_INDEX_BASE: BigNumber = BigNumber.from(new BNJS(1e36).toFixed());
export const OWNER_ROLE_KEY: string = 'ownerRole';
export const EPOCH_PARAMETERS_ROLE_KEY: string = 'epochParametersRole';
export const REWARDS_RATE_ROLE_KEY: string = 'rewardsRateRole';
export const BORROWER_ADMIN_ROLE_KEY: string = 'borrowerAdminRole';
export const CLAIM_OPERATOR_ROLE_KEY: string = 'claimOperatorRole';
export const STAKE_OPERATOR_ROLE_KEY: string = 'stakeOperatorRole';
export const DEBT_OPERATOR_ROLE_KEY: string = 'debtOperatorRole';

// StarkProxyV1 constants
export const NUM_STARK_PROXY_BORROWERS: number = 3;
export const getStarkProxyBorrowerJsonDBKey = (borrowerNum: number): string =>
  `StarkProxyBorrower${borrowerNum}`;

// PEI constants
export const PSM_STAKER_PREMIUM = '2';

// just junk mock

export const RANDOM_ADDRESSES = [
  '0x0000000000000000000000000000000000000221',
  '0x0000000000000000000000000000000000000321',
  '0x0000000000000000000000000000000000000211',
  '0x0000000000000000000000000000000000000251',
  '0x0000000000000000000000000000000000000271',
  '0x0000000000000000000000000000000000000291',
  '0x0000000000000000000000000000000000000321',
  '0x0000000000000000000000000000000000000421',
  '0x0000000000000000000000000000000000000521',
  '0x0000000000000000000000000000000000000621',
  '0x0000000000000000000000000000000000000721',
];

export const getDydxTokenPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: ZERO_ADDRESS,
      [eEthereumNetwork.hardhat]: ZERO_ADDRESS,
      [eEthereumNetwork.kovan]: '0xe4483afcf0d612c011679C76B61F5b0d27bAF93C',
      [eEthereumNetwork.ropsten]: '0x74dA004A1B81b4d0C79F5820f9FF22647cb1dD95',
      [eEthereumNetwork.main]: '0x9c0435779F5E52CEC404D957C9bAa6f7d674C8bA',
    },
    network
  );

export const getCooldownSecondsPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<string>(
    {
      [eEthereumNetwork.coverage]: COOLDOWN_SECONDS,
      [eEthereumNetwork.hardhat]: COOLDOWN_SECONDS,
      [eEthereumNetwork.kovan]: '21600', // 8h
      [eEthereumNetwork.ropsten]: '180', // 3m
      [eEthereumNetwork.main]: '864000', // 10d
    },
    network
  );

export const getUnstakeWindowPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<string>(
    {
      [eEthereumNetwork.coverage]: UNSTAKE_WINDOW,
      [eEthereumNetwork.hardhat]: UNSTAKE_WINDOW,
      [eEthereumNetwork.kovan]: '10800', // 4h
      [eEthereumNetwork.ropsten]: '240', // 4m
      [eEthereumNetwork.main]: '172800', // 2d
    },
    network
  );

export const getDydxAdminPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: ZERO_ADDRESS,
      [eEthereumNetwork.hardhat]: ZERO_ADDRESS,
      [eEthereumNetwork.kovan]: '0x8134929c3dcb1b8b82f27f53424b959fb82182f2', // Governance (TODO)
      [eEthereumNetwork.ropsten]: '0xEd93e49A2d75beA505fD4D1A0Dff745f69F2E997', // Governance (TODO)
      [eEthereumNetwork.main]: '0x8a2Efd9A790199F4c94c6effE210fce0B4724f52', // Governance (TODO)
    },
    network
  );

export const getDistributionDurationPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: DISTRIBUTION_DURATION,
      [eEthereumNetwork.hardhat]: DISTRIBUTION_DURATION,
      [eEthereumNetwork.kovan]: '864000',
      [eEthereumNetwork.ropsten]: '864000',
      [eEthereumNetwork.main]: '12960000', // 5 months (30 days) in seconds
    },
    network
  );

export const getDydxIncentivesVaultPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: '',
      [eEthereumNetwork.hardhat]: '',
      [eEthereumNetwork.kovan]: '',
      [eEthereumNetwork.ropsten]: '',
      [eEthereumNetwork.main]: '0x253f7b06c1d60c1fbbc9d82c301327eb86e3ba81',
    },
    network
  );
