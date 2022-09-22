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
