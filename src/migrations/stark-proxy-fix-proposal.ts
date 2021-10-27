import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import {
  DydxGovernor__factory,
} from '../../types';
import { DydxGovernor } from '../../types/DydxGovernor';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createStarkProxyFixProposal({
  proposalIpfsHashHex,
  governorAddress,
  shortTimelockAddress,
  starkProxyAddress,
  starkProxyProxyAdminAddress,
  starkProxyNewImplAddress,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  shortTimelockAddress: string,
  starkProxyAddress: string,
  starkProxyProxyAdminAddress: string,
  starkProxyNewImplAddress: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating stark proxy fix proposal with proposer ${deployerAddress}\n`);

  const governor: DydxGovernor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    shortTimelockAddress,
    [starkProxyProxyAdminAddress],
    ['0'],
    ['upgrade(address,address)'],
    [hre.ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [starkProxyAddress, starkProxyNewImplAddress],
    )],
    [false],
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
