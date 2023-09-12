import { Role } from '../types';
import { getRole } from './util';

export const ONE_DAY_SECONDS = 60 * 60 * 24;
export const ONE_DAY_BLOCKS = 6570; // Assume 13s per block

export const ONE_ADDRESS = '0x0000000000000000000000000000000000000001';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const MAX_UINT_AMOUNT = (
  '115792089237316195423570985008687907853269984665640564039457584007913129639935'
);
export const USDC_TOKEN_DECIMALS = 6;

export const SM_EXCHANGE_RATE_BASE = 1e18;
export const LS_SHORTFALL_INDEX_BASE = 1e36;

export const SM_ROLE_HASHES = [
  Role.OWNER_ROLE,
  Role.SLASHER_ROLE,
  Role.EPOCH_PARAMETERS_ROLE,
  Role.REWARDS_RATE_ROLE,
  Role.CLAIM_OPERATOR_ROLE,
  Role.STAKE_OPERATOR_ROLE,
].map(getRole);

// DIP_6_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-6-Ipfs-hashes.json
export const DIP_6_IPFS_HASH = '0xb659e2db02977540be8821312b75aa2e18d9e8ab60a2708b3d64e7fd5bc7c9bd';

// DIP_12_IPFS_HASH
export const DIP_12_IPFS_HASH = '0x842193abdf79d8611e365fd072cb5cd3cd679045c26ff4db5da28fdd81ab1f32';

// DIP_14_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-14-Ipfs-hashes.json
export const DIP_14_IPFS_HASH = '0x32db80af31713b3a4eda8ce6a30cf125dd8361d6f3df437c6667c98432757795';

// DIP_16_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-16-Ipfs-hashes.json
export const DIP_16_IPFS_HASH = '0xb2c2e8a63f8ee41fc40601c1f0b0ef41f919b34cb2a0547402153cd9accd4c6a';

// DIP_17_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-17-Ipfs-hashes.json
export const DIP_17_IPFS_HASH = '0x458f80f0cde145e2d3cbccfeea97d961cf282bedcc291d3960b82e2bee1a2f50';

// DIP_18_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-18-Ipfs-hashes.json
export const DIP_18_IPFS_HASH = '0x3876d28a014bc20432dcc3549ba95710446b98431d84c7f84fde6abe1baf527f';

// DIP_20_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-20-Ipfs-hashes.json
export const DIP_20_IPFS_HASH = '0xe37f1d3d22bc1d86f6273c8513d30e3c81f44cd3befa3d2f04c849d82c6c0ab5';

// DIP_22_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-22-Ipfs-hashes.json
export const DIP_22_IPFS_HASH = '0x11e2866e87f43c68118021b1efaf1053be1f3cb0d25c017b08da5ba8c4de9ce9';

// DIP_23_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-23-Ipfs-hashes.json
export const DIP_23_IPFS_HASH = '0x5aca381042cb641c1000126d5a183c38b17492eb60a86910973d0c3f1e867f43';

// DIP_24_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-24-Ipfs-hashes.json
export const DIP_24_IPFS_HASH = '0x3a7575988e0aa9c066830c1e8f8958d9b81d0365cfb6e478076ae111d3f3190c';

// DIP_26_IPFS_HASH taken from the link below:
// https://github.com/dydxfoundation/dip/blob/master/content/ipfs-dips/DIP-26-Ipfs-hashes.json
export const DIP_26_IPFS_HASH = '0x4e09e2db5902fe2ffce429be407d507de75b69cb94f138b0785d3af1eaf083ec';
