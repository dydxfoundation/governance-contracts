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

export async function updateMerkleDistributorRewardsParametersDIP24Proposal({
  proposalIpfsHashHex,
  governorAddress,
  merkleDistributorAddress,
  shortTimelockAddress,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  merkleDistributorAddress: string,
  shortTimelockAddress: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployConfig = getDeployConfig();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating Update Merkle Distributor Rewards Parameters DIP 24 proposal with proposer ${deployerAddress}.\n`);

  const governor = await new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    shortTimelockAddress,
    [merkleDistributorAddress],
    ['0'],
    ['setRewardsParameters(uint256,uint256,uint256)'],
    [hre.ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256'],
      [
        deployConfig.UPDATE_MERKLE_DISTRIBUTOR_LP_REWARDS_AMOUNT_DIP24,
        deployConfig.UPDATE_MERKLE_DISTRIBUTOR_TRADER_REWARDS_AMOUNT_DIP24,
        deployConfig.UPDATE_MERKLE_DISTRIBUTOR_ALPHA_PARAMETER_DIP24,
      ],
    )],
    [false],
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
