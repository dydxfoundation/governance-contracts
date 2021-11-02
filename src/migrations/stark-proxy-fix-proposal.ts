import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory,
} from '../../types';
import { DydxGovernor } from '../../types/DydxGovernor';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createStarkProxyFixProposal({
  proposalIpfsHashHex,
  governorAddress,
  shortTimelockAddress,
  starkProxyAddresses,
  starkProxyProxyAdminAddresses,
  starkProxyNewImplAddresses,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  shortTimelockAddress: string,
  starkProxyAddresses: string[],
  starkProxyProxyAdminAddresses: string[],
  starkProxyNewImplAddresses: string[],
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating stark proxy fix proposal with proposer ${deployerAddress}\n`);

  const governor: DydxGovernor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();

  const values: string[] = new Array(starkProxyProxyAdminAddresses.length).fill('0');
  const functionSignatures: string[] = new Array(starkProxyProxyAdminAddresses.length).fill('upgradeAndCall(address,address,bytes)');

  const initializeCalldata = new Interface(StarkProxyV2__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );
  const calldatas: string[] = starkProxyAddresses.map((sp: string, i: number) =>
    hre.ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [sp, starkProxyNewImplAddresses[i], initializeCalldata],
    ),
  );
  const delegateCalls: boolean[] = new Array(starkProxyProxyAdminAddresses.length).fill(false);

  const proposal: Proposal = [
    shortTimelockAddress,
    starkProxyProxyAdminAddresses,
    values,
    functionSignatures,
    calldatas,
    delegateCalls,
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
