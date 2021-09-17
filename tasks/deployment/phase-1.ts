import { types } from 'hardhat/config';

import { deployPhase1 } from '../../src/deployment/phase-1';
import { hardhatTask } from '../../src/hre';

hardhatTask('deploy:phase-1', 'Phase 1 of governance deployment.')
  .addParam('startStep', 'Which step to start with', 1, types.int)
  .addParam('dydxTokenAddress', 'Previously deployed dYdX token address', '', types.string)
  .addParam('governorAddress', 'Previously deployed dYdX governor address', '', types.string)
  .addParam('shortTimelockAddress', 'Previously deployed short timelock address', '', types.string)
  .addParam('longTimelockAddress', 'Previously deployed long timelock address', '', types.string)
  .addParam('merklePauserTimelockAddress', 'Previously deployed Merkle pauser timelock address', '', types.string)
  .setAction(async (args) => {
    await deployPhase1(args);
  });
