import { formatEther } from 'ethers/lib/utils';

import {
  ClaimsProxy,
  ClaimsProxy__factory,
  DydxGovernor__factory,
  DydxToken__factory,
  Executor__factory,
  GovernanceStrategy,
  GovernanceStrategy__factory,
  LiquidityStakingV1__factory,
  MerkleDistributorV1__factory,
  ProxyAdmin,
  ProxyAdmin__factory,
  SafetyModuleV1,
  SafetyModuleV1__factory,
  Treasury,
  TreasuryVester,
  TreasuryVester__factory,
  Treasury__factory,
} from '../../types';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../lib/constants';
import { log } from '../lib/logging';
import { getRole, toWad, waitForTx } from '../lib/util';
import { Role } from '../types';
import { deployUpgradeable } from './helpers/deploy-upgradeable';
import { transferWithPrompt } from './helpers/transfer-tokens';

export async function deployPhase2({
  startStep = 0,

  // Phase 1 deployed contracts.
  dydxTokenAddress,
  governorAddress,
  shortTimelockAddress,
  longTimelockAddress,
  merklePauserTimelockAddress: merkleTimelockAddress,

  // Phase 2 deployed contracts.
  rewardsTreasuryAddress,
  rewardsTreasuryProxyAdminAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  strategyAddress,
  communityTreasuryAddress,
  communityTreasuryProxyAdminAddress,
  rewardsTreasuryVesterAddress,
  communityTreasuryVesterAddress,
  claimsProxyAddress,
  liquidityStakingAddress,
  liquidityStakingProxyAdminAddress,
  merkleDistributorAddress,
  merkleDistributorProxyAdminAddress,
}: {
  startStep?: number,

  // Phase 1 deployed contracts.
  dydxTokenAddress: string,
  governorAddress: string,
  longTimelockAddress: string,
  shortTimelockAddress: string,
  merklePauserTimelockAddress: string,

  // Phase 2 deployed contracts.
  rewardsTreasuryAddress?: string,
  rewardsTreasuryProxyAdminAddress?: string,
  safetyModuleAddress?: string,
  safetyModuleProxyAdminAddress?: string,
  strategyAddress?: string,
  communityTreasuryAddress?: string,
  communityTreasuryProxyAdminAddress?: string,
  rewardsTreasuryVesterAddress?: string,
  communityTreasuryVesterAddress?: string,
  claimsProxyAddress?: string,
  liquidityStakingAddress?: string,
  liquidityStakingProxyAdminAddress?: string,
  merkleDistributorAddress?: string,
  merkleDistributorProxyAdminAddress?: string,
}) {
  log('Beginning phase 2 deployment\n');
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  // Phase 1 deployed contracts.
  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const longTimelock = new Executor__factory(deployer).attach(longTimelockAddress);
  const shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);

  // Phase 2 deployed contracts.
  let rewardsTreasury: Treasury;
  let rewardsTreasuryProxyAdmin: ProxyAdmin;
  let safetyModule: SafetyModuleV1;
  let safetyModuleProxyAdmin: ProxyAdmin;
  let strategy: GovernanceStrategy;
  let communityTreasury: Treasury;
  let communityTreasuryProxyAdmin: ProxyAdmin;
  let rewardsTreasuryVester: TreasuryVester;
  let communityTreasuryVester: TreasuryVester;
  let claimsProxy: ClaimsProxy;
  let liquidityStaking: LiquidityStakingV1;
  let liquidityStakingProxyAdmin: ProxyAdmin;
  let merkleDistributor: MerkleDistributorV1;
  let merkleDistributorProxyAdmin: ProxyAdmin;

  const deployerBalance = await dydxToken.balanceOf(deployerAddress);
  if (deployerBalance.lt(toWad(500_000_00))) {
    throw new Error(`Need at least 500M DYDX to run this deploy script. Current balance: ${formatEther(deployerBalance)}`);
  }

  if (startStep <= 1) {
    log('Step 1. Deploy upgradeable Rewards Treasury');
    [rewardsTreasury, , rewardsTreasuryProxyAdmin] = await deployUpgradeable(
      Treasury__factory,
      deployer,
      [],
      [],
    );
    rewardsTreasuryAddress = rewardsTreasury.address;
    rewardsTreasuryProxyAdminAddress = rewardsTreasuryProxyAdmin.address;
  } else {
    if (!rewardsTreasuryAddress) {
      throw new Error('Expected parameter rewardsTreasuryAddress to be specified.');
    }
    if (!rewardsTreasuryProxyAdminAddress) {
      throw new Error('Expected parameter rewardsTreasuryProxyAdminAddress to be specified.');
    }
    rewardsTreasury = new Treasury__factory(deployer).attach(rewardsTreasuryAddress);
    rewardsTreasuryProxyAdmin = new ProxyAdmin__factory(deployer).attach(rewardsTreasuryProxyAdminAddress);
  }

  if (startStep <= 2) {
    log('Step 2. Deploy and initialize upgradeable Safety Module');
    [safetyModule, , safetyModuleProxyAdmin] = await deployUpgradeable(
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
    safetyModuleProxyAdminAddress = safetyModuleProxyAdmin.address;
  } else {
    if (!safetyModuleAddress) {
      throw new Error('Expected parameter safetyModuleAddress to be specified.');
    }
    if (!safetyModuleProxyAdminAddress) {
      throw new Error('Expected parameter safetyModuleProxyAdminAddress to be specified.');
    }
    safetyModule = new SafetyModuleV1__factory(deployer).attach(safetyModuleAddress);
    safetyModuleProxyAdmin = new ProxyAdmin__factory(deployer).attach(safetyModuleProxyAdminAddress);
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
    [communityTreasury, , communityTreasuryProxyAdmin] = await deployUpgradeable(
      Treasury__factory,
      deployer,
      [],
      [],
    );
    communityTreasuryAddress = communityTreasury.address;
    communityTreasuryProxyAdminAddress = communityTreasuryProxyAdmin.address;
  } else {
    if (!communityTreasuryAddress) {
      throw new Error('Expected parameter communityTreasuryAddress to be specified.');
    }
    if (!communityTreasuryProxyAdminAddress) {
      throw new Error('Expected parameter communityTreasuryProxyAdminAddress to be specified.');
    }
    communityTreasury = new Treasury__factory(deployer).attach(communityTreasuryAddress);
    communityTreasuryProxyAdmin = new ProxyAdmin__factory(deployer).attach(communityTreasuryProxyAdminAddress);
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

  if (startStep <= 8) {
    log('Step 8. Deploy merkle distributor proxy + merkle distributor proxy admin + merkle distributor');
    [merkleDistributor, , merkleDistributorProxyAdmin] = await deployUpgradeable(
      MerkleDistributorV1__factory,
      deployer,
      [
        dydxTokenAddress,
        rewardsTreasuryAddress,
      ],
      [
        ZERO_ADDRESS,
        deployConfig.MERKLE_DISTRIBUTOR_CONFIG.IPNS_NAME,
        deployConfig.MERKLE_DISTRIBUTOR_CONFIG.IPFS_UPDATE_PERIOD,
        toWad(deployConfig.MERKLE_DISTRIBUTOR_CONFIG.MARKET_MAKER_REWARDS_AMOUNT),
        toWad(deployConfig.MERKLE_DISTRIBUTOR_CONFIG.TRADER_REWARDS_AMOUNT),
        toWad(deployConfig.MERKLE_DISTRIBUTOR_CONFIG.TRADER_SCORE_ALPHA),
        deployConfig.EPOCH_ZERO_START,
        deployConfig.EPOCH_LENGTH,
      ],
    );
    merkleDistributorAddress = merkleDistributor.address;
    merkleDistributorProxyAdminAddress = merkleDistributorProxyAdmin.address;
  } else {
    if (!merkleDistributorAddress) {
      throw new Error('Expected parameter merkleDistributorAddress to be specified.');
    }
    merkleDistributor = new MerkleDistributorV1__factory(deployer).attach(merkleDistributorAddress);

    if (!merkleDistributorProxyAdminAddress) {
      throw new Error('Expected parameter merkleDistributorProxyAdminAddress to be specified.');
    }
    merkleDistributorProxyAdmin = new ProxyAdmin__factory(deployer).attach(merkleDistributorProxyAdminAddress);
  }


  // TODO: Add steps 8–10.

  if (startStep <= 11) {
    log('Step 11. Deploy liquidity staking proxy + liquidity staking proxy admin + liquidity staking');
    [liquidityStaking, , liquidityStakingProxyAdmin] = await deployUpgradeable(
      LiquidityStakingV1__factory,
      deployer,
      [
        deployConfig.DYDX_COLLATERAL_TOKEN_ADDRESS,
        dydxTokenAddress,
        rewardsTreasuryAddress,
        deployConfig.LS_DISTRIBUTION_START,
        deployConfig.LS_DISTRIBUTION_END,
      ],
      [
        deployConfig.EPOCH_LENGTH,
        deployConfig.EPOCH_ZERO_START,
        deployConfig.BLACKOUT_WINDOW,
      ],
    );
    liquidityStakingAddress = liquidityStaking.address;
    liquidityStakingProxyAdminAddress = liquidityStakingProxyAdmin.address;
  } else {
    if (!liquidityStakingAddress) {
      throw new Error('Expected parameter liquidityStakingAddress to be specified.');
    }
    liquidityStaking = new LiquidityStakingV1__factory(deployer).attach(liquidityStakingAddress);

    if (!liquidityStakingProxyAdminAddress) {
      throw new Error('Expected parameter liquidityStakingProxyAdminAddress to be specified.');
    }
    liquidityStakingProxyAdmin = new ProxyAdmin__factory(deployer).attach(liquidityStakingProxyAdminAddress);
  }

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
    await waitForTx(
      await rewardsTreasury.approve(dydxTokenAddress, liquidityStakingAddress, MAX_UINT_AMOUNT),
    );
    await waitForTx(
      await rewardsTreasury.approve(dydxTokenAddress, merkleDistributorAddress, MAX_UINT_AMOUNT),
    );
  }

  if (startStep <= 14) {
    log('Step 14. Deploy claims proxy contract');
    claimsProxy = await new ClaimsProxy__factory(deployer).deploy(
      safetyModuleAddress,
      liquidityStakingAddress,
      merkleDistributorAddress,
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
    await waitForTx(
      await safetyModule.grantRole(getRole(Role.CLAIM_OPERATOR_ROLE), claimsProxyAddress),
    );
    await waitForTx(
      await liquidityStaking.grantRole(getRole(Role.CLAIM_OPERATOR_ROLE), claimsProxyAddress),
    );
    await waitForTx(
      await merkleDistributor.grantRole(getRole(Role.CLAIM_OPERATOR_ROLE), claimsProxyAddress),
    );
  }

  if (startStep <= 16) {
    log('Step 16. Set rewards rates for staking contracts');
    await waitForTx(await safetyModule.setRewardsPerSecond(deployConfig.SM_REWARDS_PER_SECOND));
    await waitForTx(await liquidityStaking.setRewardsPerSecond(deployConfig.LS_REWARDS_PER_SECOND));
  }

  // TODO: Add steps 17-22.

  if (startStep <= 23) {
    log('Step 23. Grant contract ownership and roles to timelocks');

    const txs = [
      // Assign roles for the Safety Module.
      await safetyModule.grantRole(getRole(Role.OWNER_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.SLASHER_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.EPOCH_PARAMETERS_ROLE), shortTimelockAddress),
      await safetyModule.grantRole(getRole(Role.REWARDS_RATE_ROLE), shortTimelockAddress),

      // Assign roles for the Liquidity Staking Module.
      await liquidityStaking.grantRole(getRole(Role.OWNER_ROLE), shortTimelockAddress),
      await liquidityStaking.grantRole(getRole(Role.EPOCH_PARAMETERS_ROLE), shortTimelockAddress),
      await liquidityStaking.grantRole(getRole(Role.REWARDS_RATE_ROLE), shortTimelockAddress),
      await liquidityStaking.grantRole(getRole(Role.BORROWER_ADMIN_ROLE), shortTimelockAddress),

      // Assign roles for the Merkle Distributor Module.
      await merkleDistributor.grantRole(getRole(Role.PAUSER_ROLE), merkleTimelockAddress),
      await merkleDistributor.grantRole(getRole(Role.OWNER_ROLE), shortTimelockAddress),
      await merkleDistributor.grantRole(getRole(Role.CONFIG_UPDATER_ROLE), shortTimelockAddress),
      await merkleDistributor.grantRole(getRole(Role.UNPAUSER_ROLE), shortTimelockAddress),

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

  log('\n=== PHASE 2 DEPLOYMENT COMPLETE ===\n');

  return {
    rewardsTreasury,
    rewardsTreasuryProxyAdmin,
    safetyModule,
    safetyModuleProxyAdmin,
    strategy,
    communityTreasury,
    communityTreasuryProxyAdmin,
    rewardsTreasuryVester,
    communityTreasuryVester,
    claimsProxy,
    liquidityStaking,
    liquidityStakingProxyAdmin,
    merkleDistributor,
    merkleDistributorProxyAdmin,
  };
}
