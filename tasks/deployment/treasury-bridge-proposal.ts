import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_29_IPFS_HASH } from '../../src/lib/constants';
import { createTreasuryBridgeProposal } from '../../src/migrations/treasury-bridge-proposal';

hardhatTask('deploy:treasury-bridge-proposal', 'Create proposal to bridge the rewards and community treasury.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_29_IPFS_HASH, types.string)
  .addParam('dydxTokenAddress', 'Address of the deployed DYDX token contract', mainnetAddresses.dydxToken, types.string)
  .addParam('wrappedDydxTokenAddress', 'Address of the deployed wrapped DYDX token contract', mainnetAddresses.wrappedEthereumDydxToken, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('rewardsTreasuryAddress', 'Address of the deployed rewards treasury upgradeable contract', mainnetAddresses.rewardsTreasury, types.string)
  .addParam('communityTreasuryAddress', 'Address of the deployed community treasury upgradeable contract', mainnetAddresses.communityTreasury, types.string)
  .addParam('rewardsTreasuryProxyAdminAddress', 'Address of the deployed ProxyAdmin for the rewards treasury', mainnetAddresses.rewardsTreasuryProxyAdmin, types.string)
  .addParam('communityTreasuryProxyAdminAddress', 'Address of the deployed ProxyAdmin for the community treasury', mainnetAddresses.communityTreasuryProxyAdmin, types.string)
  .addParam('rewardsTreasuryVesterAddress', 'Address of the deployed community treasury vester contract', mainnetAddresses.rewardsTreasuryVester, types.string)
  .addParam('communityTreasuryVesterAddress', 'Address of the deployed community treasury vester contract', mainnetAddresses.communityTreasuryVester, types.string)
  .addParam('rewardsTreasuryBridgeAddress', 'Address of the new deployed rewards TreasuryBridge implementation contract', mainnetAddresses.rewardsTreasuryBridge, types.string)
  .addParam('communityTreasuryBridgeAddress', 'Address of the new deployed community TreasuryBridge implementation contract', mainnetAddresses.communityTreasuryBridge, types.string)
  .addParam('logCalldata', 'True to skip sending a TX and log calldata to stdout, false if not', true, types.boolean)
  .setAction(async (args: {
    proposalIpfsHashHex: string,
    dydxTokenAddress: string,
    wrappedDydxTokenAddress: string,
    governorAddress: string,
    shortTimelockAddress: string,
    rewardsTreasuryAddress: string,
    communityTreasuryAddress: string,
    rewardsTreasuryProxyAdminAddress: string,
    communityTreasuryProxyAdminAddress: string,
    rewardsTreasuryVesterAddress: string,
    communityTreasuryVesterAddress: string,
    rewardsTreasuryBridgeAddress: string,
    communityTreasuryBridgeAddress: string,
    logCalldata: boolean,
  }) => {
    await createTreasuryBridgeProposal(
        {
            proposalIpfsHashHex: args.proposalIpfsHashHex,
            dydxTokenAddress: args.dydxTokenAddress,
            wrappedDydxTokenAddress: args.wrappedDydxTokenAddress,
            governorAddress: args.governorAddress,
            shortTimelockAddress: args.shortTimelockAddress,
            rewardsTreasuryAddress: args.rewardsTreasuryAddress,
            communityTreasuryAddress: args.communityTreasuryAddress,
            rewardsTreasuryProxyAdminAddress: args.rewardsTreasuryProxyAdminAddress,
            communityTreasuryProxyAdminAddress: args.communityTreasuryProxyAdminAddress,
            rewardsTreasuryVesterAddress: args.rewardsTreasuryVesterAddress,
            communityTreasuryVesterAddress: args.communityTreasuryVesterAddress,
            rewardsTreasuryBridgeAddress: args.rewardsTreasuryBridgeAddress,
            communityTreasuryBridgeAddress: args.communityTreasuryBridgeAddress,

            logCalldata: args.logCalldata,
        },
    );
  });
