import { DateTime } from 'luxon';

import mainnetConfig from './mainnet-config';

/**
 * The epoch zero timestamp that was used for the phase 2 mainnet deployment.
 * This resulted in the following parameters being set on mainnet:
 *
 *   DydxToken._transferRestrictedBefore: 2021-09-08T15:00:00 = 1631113200
 */
const PHASE_2_EPOCH_ZERO_START_DT = DateTime.fromISO('2021-08-03T15:00:00', { zone: 'utc' });
const PHASE_2_EPOCH_ZERO_START = PHASE_2_EPOCH_ZERO_START_DT.toSeconds();

export default {
  DYDX_COLLATERAL_TOKEN_ADDRESS: mainnetConfig.DYDX_COLLATERAL_TOKEN_ADDRESS,
  STARK_PERPETUAL_ADDRESS: mainnetConfig.STARK_PERPETUAL_ADDRESS,
  EPOCH_ZERO_START: PHASE_2_EPOCH_ZERO_START,
};
