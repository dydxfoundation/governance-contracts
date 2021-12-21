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

// DIP_6_IPFS_HASH taken from the dydxfoundation/dip/content/ipfs-dip/DIP-6-Ipfs-hashes file
export const DIP_6_IPFS_HASH = '0x48f4fd54def63e5aa2f09540b068f06705e47bf848d3bbc7dc731aef04f3b103'
