import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import {
  Executor,
  Executor__factory,
} from '../../../types';
import { TimelockConfig } from '../../types';

export async function deployExecutor(
  deployer: SignerWithAddress,
  governorAddress: string,
  config: TimelockConfig,
): Promise<Executor> {
  return new Executor__factory(deployer).deploy(
    governorAddress,
    config.DELAY,
    config.GRACE_PERIOD,
    config.MINIMUM_DELAY,
    config.MAXIMUM_DELAY,
    config.PROPOSITION_THRESHOLD,
    config.VOTING_DURATION_BLOCKS,
    config.VOTE_DIFFERENTIAL,
    config.MINIMUM_QUORUM,
  );
}
