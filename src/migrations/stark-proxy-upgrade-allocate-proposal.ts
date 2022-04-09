import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory, LiquidityStakingV1, LiquidityStakingV1__factory, StarkProxyV3__factory,
} from '../../types';
import { DydxGovernor } from '../../types/DydxGovernor';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createStarkProxyUpgradeAllocateProposal({
  proposalIpfsHashHex,
  governorAddress,
  liquidityStakingAddress,
  liquidityStakingAdminAddress,
  shortTimelockAddress,

  currentStarkProxyAddresses,
  currentStarkProxyProxyAdminAddresses,
  currentStarkProxyNewImplAddresses,
  currentStarkProxyBorrowerAllocations,

  newStarkProxyAddresses,
  newStarkProxyBorrowerAllocations,

  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  liquidityStakingAddress: string,
  liquidityStakingAdminAddress: string,
  shortTimelockAddress: string,

  currentStarkProxyAddresses: string[],
  currentStarkProxyProxyAdminAddresses: string[],
  currentStarkProxyNewImplAddresses: string[],
  currentStarkProxyBorrowerAllocations: string[],

  newStarkProxyAddresses: string[],
  newStarkProxyProxyAdminAddresses: string[],
  newStarkProxyBorrowerAllocations: string[],
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating stark proxy fix proposal with proposer ${deployerAddress}.\n`);

  // const liquidityStaking: LiquidityStakingV1 = new LiquidityStakingV1__factory(deployer).attach(liquidityStakingAddress);
  const governor: DydxGovernor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();

  // --- START: Current starkProxy upgrade logic ---
  const upgradeValues: string[] = new Array(currentStarkProxyProxyAdminAddresses.length).fill('0');
  const upgradeFunctionSignatures: string[] = new Array(currentStarkProxyProxyAdminAddresses.length)
    .fill('upgradeAndCall(address,address,bytes)');

  const initializeCalldata = new Interface(StarkProxyV3__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );
  const upgradeCalldatas: string[] = currentStarkProxyAddresses.map(
    (spAddress, i) => hre.ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [spAddress, currentStarkProxyNewImplAddresses[i], initializeCalldata],
    ),
  );
  const upgradeDelegateCalls: boolean[] = new Array(currentStarkProxyProxyAdminAddresses.length).fill(false);
  // --- END: Current starkProxy upgrade logic ---

  // --- START: Current starkProxy setBorrowerAllocations ---
  const currentBorrowValue: string = '0';
  const currentBorrowFunctionSignature: string = 'setBorrowerAllocations(address[],uint256[])';

  const currentBorrowCalldata: string = hre.ethers.utils.defaultAbiCoder.encode(
    ['address[]', 'uint256[]'],
    [currentStarkProxyAddresses, currentStarkProxyBorrowerAllocations],
  );
  const currentBorrowDelegateCall: boolean = false;
  // --- END: Current starkProxy setBorrowerAllocations ---

  // --- START: New starkProxy setBorrowerAllocations ---
  const newBorrowValue: string = '0';
  const newBorrowFunctionSignature: string = 'setBorrowerAllocations(address[],uint256[])';

  const newBorrowCalldata: string = hre.ethers.utils.defaultAbiCoder.encode(
    ['address[]', 'uint256[]'],
    [newStarkProxyAddresses, newStarkProxyBorrowerAllocations],
  );
  const newBorrowDelegateCall: boolean = false;
  // --- END: New starkProxy setBorrowerAllocations ---

  const adminAddresses: string[] = [
    ...currentStarkProxyProxyAdminAddresses,
    liquidityStakingAdminAddress,
    liquidityStakingAdminAddress,
  ];
  const values: string[] = [
    ...upgradeValues,
    currentBorrowValue,
    newBorrowValue,
  ];
  const functionSignatures: string[] = [
    ...upgradeFunctionSignatures,
    currentBorrowFunctionSignature,
    newBorrowFunctionSignature,
  ];
  const calldatas: string[] = [
    ...upgradeCalldatas,
    currentBorrowCalldata,
    newBorrowCalldata,
  ];
  const delegateCalls: boolean[] = [
    ...upgradeDelegateCalls,
    currentBorrowDelegateCall,
    newBorrowDelegateCall,
  ];

  const proposal: Proposal = [
    shortTimelockAddress,
    adminAddresses,
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
