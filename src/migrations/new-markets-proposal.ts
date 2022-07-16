import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import {
  DydxGovernor__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createNewMarketsProposal({
  proposalIpfsHashHex,
  governorAddress,
  priorityExecutorStarkware,
  starkexHelperGovernor,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  priorityExecutorStarkware: string,
  starkexHelperGovernor: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployConfig = getDeployConfig();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating New Assets proposal with proposer ${deployerAddress}.\n`);

  const governor = await new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    priorityExecutorStarkware,
    [starkexHelperGovernor],
    ['0'],
    ['executeAssetConfigurationChanges(uint256[],bytes32[])'],
    [hre.ethers.utils.defaultAbiCoder.encode(
      ['uint256[]', 'bytes32[]'],
      [deployConfig.NEW_ASSET_IDS, deployConfig.NEW_ASSET_HASHES],
    )],
    [false],
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}