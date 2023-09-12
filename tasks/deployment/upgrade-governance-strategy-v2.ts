import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_26_IPFS_HASH } from '../../src/lib/constants';
import { createUpgradeGovernanceStrategyV2Proposal } from '../../src/migrations/upgrade-governance-strategy-v2';

hardhatTask('deploy:upgrade-governance-strategy-v2-proposal', 'Create proposal to upgrade to governance strategy V2.')
  .addParam('governanceStrategyV2Address', 'Address of the deployed GovernanceStrategyV2 contract', '', types.string)
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_26_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('longTimelockAddress', 'Address of the deployed Long Timelock contract', mainnetAddresses.longTimelock, types.string)
  .addParam('logCalldata', 'True to skip sending a TX and log calldata to stdout, false if not', true, types.boolean)
  .setAction(async (args: {
    governanceStrategyV2Address: string,
    proposalIpfsHashHex: string,
    governorAddress: string,
    longTimelockAddress: string,
    logCalldata: boolean,
  }) => {
    if (!args.governanceStrategyV2Address) {
        throw new Error('Expected parameter governanceStrategyV2Address to be specified.');
    }

    await createUpgradeGovernanceStrategyV2Proposal(
        {
            proposalIpfsHashHex: args.proposalIpfsHashHex,
            governanceStrategyV2Address: args.governanceStrategyV2Address,
            governorAddress: args.governorAddress,
            longTimelockAddress: args.longTimelockAddress,

            logCalldata: args.logCalldata,
        },
    );
  });
