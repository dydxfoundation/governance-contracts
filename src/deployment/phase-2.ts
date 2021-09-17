import { formatEther } from 'ethers/lib/utils';

import {
  ClaimsProxy,
  ClaimsProxy__factory,
  DydxGovernor__factory,
  DydxToken__factory,
  Executor__factory,
  GovernanceStrategy,
  GovernanceStrategy__factory,
  SafetyModuleV1,
  SafetyModuleV1__factory,
  Treasury,
  TreasuryVester,
  TreasuryVester__factory,
  Treasury__factory,
} from '../../types';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../constants';
import { getDeployConfig } from '../deploy-config';
import { getHre } from '../hre';
import { log } from '../logging';
import { Role } from '../types';
import { getRole, toWad, waitForTx } from '../util';
import { deployUpgradeable } from './deploy-upgradeable';
import { transferWithPrompt } from './transfer-tokens';

export async function deployPhase2({
  startStep = 0,

  // Phase 1 deployed contracts.
  dydxTokenAddress,
  governorAddress,
  shortTimelockAddress,
  longTimelockAddress,

  // Phase 2 deployed contracts.
  rewardsTreasuryAddress,
  safetyModuleAddress,
  strategyAddress,
  communityTreasuryAddress,
  rewardsTreasuryVesterAddress,
  communityTreasuryVesterAddress,
  claimsProxyAddress,
}: {
  startStep?: number,

  // Phase 1 deployed contracts.
  dydxTokenAddress: string,
  governorAddress: string,
  longTimelockAddress: string,
  shortTimelockAddress: string,

  // Phase 2 deployed contracts.
  rewardsTreasuryAddress?: string,
  safetyModuleAddress?: string,
  strategyAddress?: string,
  communityTreasuryAddress?: string,
  rewardsTreasuryVesterAddress?: string,
  communityTreasuryVesterAddress?: string,
  claimsProxyAddress?: string,
}) {
  log('Beginning phase 2 deployment\n');
  const deployConfig = getDeployConfig();

  const [deployer] = await getHre().ethers.getSigners();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  // Phase 1 deployed contracts.
  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const longTimelock = new Executor__factory(deployer).attach(longTimelockAddress);
  const shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);

  // Phase 2 deployed contracts.
  let rewardsTreasury: Treasury;
  let safetyModule: SafetyModuleV1;
  let strategy: GovernanceStrategy;
  let communityTreasury: Treasury;
  let rewardsTreasuryVester: TreasuryVester;
  let communityTreasuryVester: TreasuryVester;
  let claimsProxy: ClaimsProxy;

  const deployerBalance = await dydxToken.balanceOf(deployerAddress);
  if (deployerBalance.lt(toWad(500_000_00))) {
    throw new Error(`Need at least 500M DYDX to run this deploy script. Current balance: ${formatEther(deployerBalance)}`);
  }

  if (startStep <= 1) {
    log('Step 1. Deploy upgradeable Rewards Treasury');
    [rewardsTreasury] = await deployUpgradeable(
      Treasury__factory,
      deployer,
      [],
      [],
    );
    rewardsTreasuryAddress = rewardsTreasury.address;
  } else {
    if (!rewardsTreasuryAddress) {
      throw new Error('Expected parameter rewardsTreasuryAddress to be specified.');
    }
    rewardsTreasury = new Treasury__factory(deployer).attach(rewardsTreasuryAddress);
  }

  if (startStep <= 2) {
    log('Step 2. Deploy and initialize upgradeable Safety Module');
    [safetyModule] = await deployUpgradeable(
      SafetyModuleV1__factory,
      deployer,
      [
        dydxTokenAddress,
        dydxTokenAddress,
        rewardsTreasuryAddress,
        deployConfig.SM_DISTRIBUTION_START,
        deployConfig.SM_DISTRIBUTION_END,
      ],
      [
        deployConfig.EPOCH_LENGTH,
        deployConfig.EPOCH_ZERO_START,
        deployConfig.BLACKOUT_WINDOW,
      ],
    );
    safetyModuleAddress = safetyModule.address;
  } else {
    if (!safetyModuleAddress) {
      throw new Error('Expected parameter safetyModuleAddress to be specified.');
    }
    safetyModule = new SafetyModuleV1__factory(deployer).attach(safetyModuleAddress);
  }

  if (startStep <= 3) {
    log('Step 3. Deploy strategy');
    strategy = await new GovernanceStrategy__factory(deployer).deploy(
      dydxTokenAddress,
      safetyModuleAddress,
    );
    strategyAddress = strategy.address;
  } else {
    if (!strategyAddress) {
      throw new Error('Expected parameter strategyAddress to be specified.');
    }
    strategy = new GovernanceStrategy__factory(deployer).attach(strategyAddress);
  }

  if (startStep <= 4) {
    log('Step 4. Set strategy on governor');
    await waitForTx(
      await governor.setGovernanceStrategy(strategyAddress),
    );
  }

  if (startStep <= 5) {
    log('Step 5. Deploy upgradeable Community Treasury');
    [communityTreasury] = await deployUpgradeable(
      Treasury__factory,
      deployer,
      [],
      [],
    );
    communityTreasuryAddress = communityTreasury.address;
  } else {
    if (!communityTreasuryAddress) {
      throw new Error('Expected parameter communityTreasuryAddress to be specified.');
    }
    communityTreasury = new Treasury__factory(deployer).attach(communityTreasuryAddress);
  }

  if (startStep <= 6) {
    log('Step 6. Deploy rewards treasury vester');
    rewardsTreasuryVester = await new TreasuryVester__factory(deployer).deploy(
      dydxTokenAddress,
      rewardsTreasuryAddress,
      deployConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_AMOUNT,
      deployConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_BEGIN,
      deployConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_CLIFF,
      deployConfig.REWARDS_TREASURY_VESTER_CONFIG.VESTING_END,
    );
    rewardsTreasuryVesterAddress = rewardsTreasuryVester.address;
  } else {
    if (!rewardsTreasuryVesterAddress) {
      throw new Error('Expected parameter rewardsTreasuryVesterAddress to be specified.');
    }
    rewardsTreasuryVester = new TreasuryVester__factory(deployer).attach(rewardsTreasuryVesterAddress);
  }

  if (startStep <= 7) {
    log('Step 7. Deploy community treasury vester');
    communityTreasuryVester = await new TreasuryVester__factory(deployer).deploy(
      dydxTokenAddress,
      communityTreasuryAddress,
      deployConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_AMOUNT,
      deployConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_BEGIN,
      deployConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_CLIFF,
      deployConfig.COMMUNITY_TREASURY_VESTER_CONFIG.VESTING_END,
    );
    communityTreasuryVesterAddress = communityTreasuryVester.address;
  } else {
    if (!communityTreasuryVesterAddress) {
      throw new Error('Expected parameter communityTreasuryVesterAddress to be specified.');
    }
    communityTreasuryVester = new TreasuryVester__factory(deployer).attach(communityTreasuryVesterAddress);
  }

  // TODO: Add steps 8–11.

  if (startStep <= 12) {
    log('Step 12. Add treasury contracts token transfer allowlist');
    await waitForTx(
      await dydxToken.addToTokenTransferAllowlist([
        rewardsTreasuryAddress,
        communityTreasuryAddress,
      ]),
    );
  }

  if (startStep <= 13) {
    log('Step 13. Give incentive contracts infinite approval to pull funds from rewards treasury');
    await waitForTx(
      await rewardsTreasury.approve(dydxTokenAddress, safetyModuleAddress, MAX_UINT_AMOUNT),
    );
    // TODO
    // await waitForTx(await rewardsTreasury.approve(dydxTokenAddress, merkleDistributorAddress, MAX_UINT_AMOUNT));
    // await waitForTx(await rewardsTreasury.approve(dydxTokenAddress, liquidityStakingAddress, MAX_UINT_AMOUNT));
  }

  if (startStep <= 14) {
    log('Step 14. Deploy claims proxy contract');
    claimsProxy = await new ClaimsProxy__factory(deployer).deploy(
      safetyModuleAddress,
      ZERO_ADDRESS, // TODO: liquidityStakingAddress
      ZERO_ADDRESS, // TODO: merkleDistributorAddress
      rewardsTreasuryVesterAddress,
    );
    claimsProxyAddress = claimsProxy.address;
  } else {
    if (!claimsProxyAddress) {
      throw new Error('Expected parameter claimsProxyAddress to be specified.');
    }
    claimsProxy = new ClaimsProxy__factory(deployer).attach(claimsProxyAddress);
  }

  if (startStep <= 15) {
    log('Step 15. Grant CLAIM_OPERATOR_ROLE to claims proxy for incentives contracts');
    // TODO: Do the same for the Merkle distributor and liquidity staking contracts.
    await waitForTx(
      await safetyModule.grantRole(getRole(Role.CLAIM_OPERATOR_ROLE), claimsProxyAddress),
    );
  }

  if (startStep <= 16) {
    log('Step 16. Set rewards rates for staking contracts');
    // TODO: Do the same for the liquidity staking contracts.
    await waitForTx(await safetyModule.setRewardsPerSecond(deployConfig.SM_REWARDS_PER_SECOND));
  }

  // TODO: Add steps 17-22.

  if (startStep <= 23) {
    log('Step 23. Grant contract ownership and roles to timelocks');
    // TODO: Transfer roles for the Merkle distributor and liquidity staking contracts.

    const txs = [
      // Assign roles for the Safety Module.
      await safetyModule.grantRole(getRole(Role.OWNER_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.SLASHER_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.EPOCH_PARAMETERS_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.REWARDS_RATE_ROLE), shortTimelockAddress),

      // Assign roles for the Governor.
      await governor.grantRole(getRole(Role.OWNER_ROLE), longTimelock.address),
      await governor.grantRole(getRole(Role.ADD_EXECUTOR_ROLE), shortTimelock.address),
    ];
    await Promise.all(txs.map((tx) => waitForTx(tx)));
  }

  if (startStep <= 24) {
    log('Step 24. Send tokens to rewards treasury');
    await transferWithPrompt(
      dydxToken,
      rewardsTreasuryAddress,
      deployConfig.REWARDS_TREASURY_FRONTLOADED_FUNDS,
    );
  }

  return {
    rewardsTreasury,
    safetyModule,
    strategy,
    communityTreasury,
    rewardsTreasuryVester,
    communityTreasuryVester,
    claimsProxy,
  };
}
