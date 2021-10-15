import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { createSafetyModuleCompensationProposal } from '../../src/migrations/safety-module-compensation-proposal';

hardhatTask('deploy:safety-module-compensation-proposal', 'Create proposal to compensate Safety Module stakers.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', undefined, types.string)
  .addParam('dydxTokenAddress', 'Address of the deployed DYDX token contract', undefined, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', undefined, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', undefined, types.string)
  .addParam('rewardsTreasuryAddress', 'Address of the deployed rewards treasury contract', undefined, types.string)
  .addParam('safetyModuleRecoveryAddress', 'Address of the deployed SM2Recovery contract', undefined, types.string)
  .setAction(async (args) => {
    await createSafetyModuleCompensationProposal(args);
  });
