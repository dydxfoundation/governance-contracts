import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createUpgradeGovernanceStrategyV2Proposal({
  proposalIpfsHashHex,
  governanceStrategyV2Address,
  governorAddress,
  longTimelockAddress,
  signer,
  logCalldata = false,
}: {
  proposalIpfsHashHex: string,
  governanceStrategyV2Address: string,
  governorAddress: string,
  longTimelockAddress: string,

  signer?: SignerWithAddress,
  logCalldata?: boolean,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;

  if (logCalldata) {
    log(`Logging out calldata for upgrade governance strategy V2 proposal.\n`);
  } else {
    log(`Creating upgrade governance strategy V2 proposal with proposer ${deployerAddress}\n`);
  }

  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();

  const proposal: Proposal = [
    longTimelockAddress,
    [governorAddress],
    ['0'],
    ['setGovernanceStrategy(address)'],
    [
      hre.ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [governanceStrategyV2Address],
      ),
    ],
    [false],
    proposalIpfsHashHex,
  ];

  if (logCalldata) {
    const createProposalCalldata: string = new Interface(DydxGovernor__factory.abi).encodeFunctionData(
      'create',
      proposal,
    );
    log("=== BEGIN CALLDATA FOR CREATING THE UPGRADE GOVERNANCE STRATEGY V2 PROPOSAL === \n");
    log(createProposalCalldata);
    log("\n=== END CALLDATA ===\n");
  } else {
    await waitForTx(await governor.create(...proposal));
    log(`New upgrade governance strategy V2 proposal created with proposal ID: ${proposalId}`);
  }

  return {
    proposalId,
  };
}

