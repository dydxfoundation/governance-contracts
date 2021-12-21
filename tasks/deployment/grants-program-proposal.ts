import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { createGrantsProgramProposal } from '../../src/migrations/grants-program-proposal';

hardhatTask('deploy:grants-program-proposal', 'Create proposal to Launch DGP with multisig funding.')
    .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', undefined, types.string)
    .addParam('dydxTokenAddress', 'Address of the deployed DYDX token contract', mainnetAddresses.dydxToken, types.string)
    .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
    .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
    .addParam('communityTreasuryAddress', 'Address of the deployed community treasury contract', mainnetAddresses.communityTreasury, types.string)
    .setAction(async (args) => {
        await createGrantsProgramProposal(args);
    });
