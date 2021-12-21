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

export async function createGrantsProgramProposal({
  proposalIpfsHashHex,
  dydxTokenAddress,
  governorAddress,
  shortTimelockAddress,
  communityTreasuryAddress,
  signer,
}: {
  proposalIpfsHashHex: string,
  dydxTokenAddress: string,
  governorAddress: string,
  shortTimelockAddress: string,
  communityTreasuryAddress: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployConfig = getDeployConfig();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating Grants Program proposal with proposer ${deployerAddress}.\n`);

  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    shortTimelockAddress,
    [communityTreasuryAddress],
    ['0'],
    ['transfer(address,address,uint256)'],
    [hre.ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256'],
      [dydxTokenAddress, deployConfig.DGP_MULTISIG_ADDRESS, deployConfig.DGP_FUNDING_AMOUNT],
    )],
    [false],
    proposalIpfsHashHex,
  ];

  console.log('Call data:', governor.interface.encodeFunctionData('create', proposal));
  // await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
