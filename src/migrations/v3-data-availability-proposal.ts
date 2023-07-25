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

export async function createV3DataAvailabilityProposal({
  proposalIpfsHashHex,
  governorAddress,
  starkwarePriorityAddress,
  starkPerpetualAddress,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  starkwarePriorityAddress: string,
  starkPerpetualAddress: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployConfig = getDeployConfig();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating V3 Data Availability Proposal with proposer ${deployerAddress}.\n`);

  const governor = await new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    starkwarePriorityAddress,
    [starkPerpetualAddress, starkPerpetualAddress, starkPerpetualAddress, starkPerpetualAddress, starkPerpetualAddress, starkPerpetualAddress],
    ['0', '0', '0', '0', '0', '0'],
    [
      'mainAcceptGovernance()',
      'registerGlobalConfigurationChange(bytes32)',
      'applyGlobalConfigurationChange(bytes32)',
      'proxyAcceptGovernance()',
      'addImplementation(address,bytes,bool)',
      'upgradeTo(address,bytes,bool)',
    ],
    [
      hre.ethers.utils.defaultAbiCoder.encode(
        [],
        [],
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        ['bytes32'],
        [deployConfig.STARK_PERPETUAL_CONFIG_HASH],
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        ['bytes32'],
        [deployConfig.STARK_PERPETUAL_CONFIG_HASH],
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        [],
        [], 
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes', 'bool'],
        [deployConfig.IMPLEMENTATION_ADDRESS, deployConfig.BYTES_IMPLEMENTATION, false],
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes', 'bool'],
        [deployConfig.IMPLEMENTATION_ADDRESS, deployConfig.BYTES_IMPLEMENTATION, false],
      ),
    ],
    [false, false, false, false, false, false],
    proposalIpfsHashHex,
  ]; 

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}