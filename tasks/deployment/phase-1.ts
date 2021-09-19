import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { deployPhase1 } from '../../src/migrations/phase-1';

hardhatTask('deploy:phase-1', 'Phase 1 of governance deployment.')
  .addParam('startStep', 'Which step to start with', 1, types.int)
  .addParam('dydxTokenAddress', 'Previously deployed dYdX token address', undefined, types.string)
  .addParam('governorAddress', 'Previously deployed dYdX governor address', undefined, types.string)
  .addParam('shortTimelockAddress', 'Previously deployed short timelock address', undefined, types.string)
  .addParam('longTimelockAddress', 'Previously deployed long timelock address', undefined, types.string)
  .addParam('merklePauserTimelockAddress', 'Previously deployed Merkle pauser timelock address', undefined, types.string)
  .setAction(async (args) => {
    await deployPhase1(args);
  });
