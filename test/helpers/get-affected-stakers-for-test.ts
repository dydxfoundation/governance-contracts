import config from '../../src/config';
import { AFFECTED_STAKERS } from '../../src/lib/affected-stakers';

export function getAffectedStakersForTest(): string[] {
  if (config.isHardhat() && !config.FORK_MAINNET) {
    return AFFECTED_STAKERS.slice(0, config.HARDHAT_SIMULATE_AFFECTED_STAKERS);
  } else {
    return AFFECTED_STAKERS;
  }
}
