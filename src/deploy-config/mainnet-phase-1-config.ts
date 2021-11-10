import { DateTime } from 'luxon';

/**
 * The epoch zero timestamp that was used for the phase 1 mainnet deployment.
 * This resulted in the following parameters being set on mainnet:
 *
 *   DydxToken._transferRestrictedBefore:                 2021-08-19T15:00:00 = 1629385200
 *   DydxToken.TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN: 2021-09-18T15:00:00 = 1631977200
 *   DydxToken._mintingRestrictedBefore:                  2026-07-14T15:00:00 = 1784041200
 *
 * Note that DydxToken._transferRestrictedBefore was overriden in phase 2.
 */
const PHASE_1_EPOCH_ZERO_START_DT = DateTime.fromISO('2021-07-14T15:00:00', { zone: 'utc' });
const PHASE_1_EPOCH_ZERO_START = PHASE_1_EPOCH_ZERO_START_DT.toSeconds();

export default {
  EPOCH_ZERO_START: PHASE_1_EPOCH_ZERO_START,
};
