import { hardhatTask } from '../../src/hre';
import { createGrantsProgramProposal } from '../../src/migrations/grants-program-proposal';
import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';

hardhatTask('deploy:grants-program-proposal', 'Create proposal to Launch DGP with multisig funding.')
    .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', undefined, types.string)
    .addParam('dydxTokenAddress', 'Address of the deployed DYDX token contract', mainnetAddresses.dydxToken, types.string)
    .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', maintnetAddresses.governor, types.string)
    .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
    .addParam('communityTreasuryAddress', 'Address of the deployed community treasury contract', mainnetAddresses.communityTreasury, types.string)
    .addParam('dgpMultisigAddress', 'Address of the deployed DGP Multisig contract', mainnetAddresses.dgpMultisig, types.string)
    .setAction(async (args) => {
        await createGrantsProgramProposal(args);
    });
