import {
  evmRevert,
  evmSnapshot,
  DRE,
} from '../../helpers/misc-utils';
import { Signer } from 'ethers';
import rawBRE from 'hardhat';
import chai from 'chai';
// @ts-ignore
import { solidity } from 'ethereum-waffle';

import { getEthersSigners } from '../../helpers/contracts-helpers';
import { DEPLOY_CONFIG } from '../../tasks/helpers/deploy-config';
import {
  getClaimsProxy,
  getDydxGovernor,
  getExecutor,
  getGovernanceStrategy,
  getLiquidityStakingV1,
  getSafetyModuleV1,
  getMockStarkPerpetual,
  getChainlinkAdapter,
} from '../../helpers/contracts-getters';
import {
  getRewardsTreasuryVester,
  getCommunityTreasuryVester,
  getRewardsTreasury,
  getDydxCommunityTreasury,
  getStarkwarePriorityTimelock,
  getStarkExHelperGovernor,
  getStarkExRemoverGovernor,
  getMintableErc20,
  getMockChainlinkToken,
  getBorrowerStarkProxy,
} from '../../helpers/contracts-deployments';
import { tEthereumAddress, eContractId } from '../../helpers/types';
import { DydxGovernor } from '../../types/DydxGovernor';
import { DydxToken } from '../../types/DydxToken';
import { Executor } from '../../types/Executor';
import { GovernanceStrategy } from '../../types/GovernanceStrategy';
import { TreasuryVester } from '../../types/TreasuryVester';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { SafetyModuleV1 } from '../../types/SafetyModuleV1';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { ClaimsProxy } from '../../types/ClaimsProxy';
import { MintableErc20 } from '../../types/MintableErc20';
import { PriorityExecutor } from '../../types/PriorityExecutor';
import { getMerkleDistributor, getDydxToken } from '../../helpers/contracts-getters';
import { Treasury } from '../../types/Treasury';
import { StarkExHelperGovernor } from '../../types/StarkExHelperGovernor';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { StarkExRemoverGovernor } from '../../types/StarkExRemoverGovernor';
import { Md1ChainlinkAdapter } from '../../types/Md1ChainlinkAdapter';
import { MockChainlinkToken } from '../../types/MockChainlinkToken';

chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}

export interface TestEnv {
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
  dydxToken: DydxToken;
  governor: DydxGovernor;
  strategy: GovernanceStrategy;
  shortTimelock: Executor;
  longTimelock: Executor;
  merkleTimelock: Executor;
  starkwarePriorityTimelock: PriorityExecutor;
  rewardsTreasury: Treasury;
  rewardsTreasuryVester: TreasuryVester;
  communityTreasury: Treasury;
  communityTreasuryVester: TreasuryVester;
  safetyModule: SafetyModuleV1;
  merkleDistributor: MerkleDistributorV1;
  chainlinkAdapter: Md1ChainlinkAdapter;
  liquidityStaking: LiquidityStakingV1;
  starkProxyV1Borrowers: StarkProxyV1[];
  claimsProxy: ClaimsProxy;
  starkExHelperGovernor: StarkExHelperGovernor;
  starkExRemoverGovernor: StarkExRemoverGovernor;
  mockStarkPerpetual: MockStarkPerpetual;
  mockStakedToken: MintableErc20;
  mockChainlinkToken: MockChainlinkToken;
  mockGovernorToRemove: SignerWithAddress;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  if (DRE.network.name === 'hardhat') {
    buidlerevmSnapshotId = id;
  }
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  dydxToken: {} as DydxToken,
  governor: {} as DydxGovernor,
  strategy: {} as GovernanceStrategy,
  shortTimelock: {} as Executor,
  longTimelock: {} as Executor,
  merkleTimelock: {} as Executor,
  starkwarePriorityTimelock: {} as PriorityExecutor,
  rewardsTreasury: {} as Treasury,
  rewardsTreasuryVester: {} as TreasuryVester,
  communityTreasury: {} as Treasury,
  communityTreasuryVester: {} as TreasuryVester,
  safetyModule: {} as SafetyModuleV1,
  merkleDistributor: {} as MerkleDistributorV1,
  chainlinkAdapter: {} as Md1ChainlinkAdapter,
  liquidityStaking: {} as LiquidityStakingV1,
  starkProxyV1Borrowers: [] as StarkProxyV1[],
  claimsProxy: {} as ClaimsProxy,
  starkExHelperGovernor: {} as StarkExHelperGovernor,
  starkExRemoverGovernor: {} as StarkExRemoverGovernor,
  mockStarkPerpetual: {} as MockStarkPerpetual,
  mockStakedToken: {} as MintableErc20,
  mockChainlinkToken: {} as MockChainlinkToken,
  mockGovernorToRemove: {} as SignerWithAddress,
} as TestEnv;

let INITIALIZED_PHASE_2: Boolean = false;

export async function initializeMakeSuite() {
  const [_deployer, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  testEnv.users = await Promise.all(
    restSigners.map(async (signer) => ({
      signer,
      address: await signer.getAddress(),
    }))
  );

  testEnv.deployer = deployer;
  testEnv.dydxToken = await getDydxToken();
  testEnv.governor = await getDydxGovernor();
  testEnv.strategy = await getGovernanceStrategy();
  testEnv.shortTimelock = await getExecutor(eContractId.ShortTimelock);
  testEnv.longTimelock = await getExecutor(eContractId.ShortTimelock);
  testEnv.merkleTimelock = await getExecutor(eContractId.ShortTimelock);
  testEnv.starkwarePriorityTimelock = await getStarkwarePriorityTimelock();
  testEnv.rewardsTreasury = await getRewardsTreasury();
  testEnv.rewardsTreasuryVester = await getRewardsTreasuryVester();
  testEnv.communityTreasury = await getDydxCommunityTreasury();
  testEnv.communityTreasuryVester = await getCommunityTreasuryVester();
  testEnv.merkleDistributor = await getMerkleDistributor();
  testEnv.chainlinkAdapter = await getChainlinkAdapter();
  testEnv.liquidityStaking = await getLiquidityStakingV1();
  testEnv.safetyModule = await getSafetyModuleV1();
  testEnv.claimsProxy = await getClaimsProxy();
  testEnv.starkExHelperGovernor = await getStarkExHelperGovernor();
  testEnv.starkExRemoverGovernor = await getStarkExRemoverGovernor();
  testEnv.mockStarkPerpetual = await getMockStarkPerpetual();
  testEnv.mockStakedToken = await getMintableErc20('USDC');
  testEnv.mockChainlinkToken = await getMockChainlinkToken();
  testEnv.mockGovernorToRemove = testEnv.users[0];

  const borrowers: StarkProxyV1[] = [];
  for (var i = 0; i < DEPLOY_CONFIG.STARK_PROXY.BORROWER_CONFIGS.length; i++) {
    const borrowContract: StarkProxyV1 = await getBorrowerStarkProxy(i);
    borrowers.push(borrowContract);
  }
  testEnv.starkProxyV1Borrowers = borrowers;
}

export async function deployPhase2() {
  if (!INITIALIZED_PHASE_2) {
    console.log('-> Deploying phase 2 test environment...');
    await rawBRE.run('migrate:mainnet', { runPhase3: false });
    await initializeMakeSuite();
    INITIALIZED_PHASE_2 = true;
  } else {
    console.log("Phase 2 already deployed.")
  }
  console.log('\n***************');
  console.log('Snapshot finished');
  console.log('***************\n');
}

export async function noDeploy() {
  console.log('-> Skipping deploy...');
  console.log('\n***************');
  console.log('Snapshot finished');
  console.log('***************\n');
}

export async function makeSuite(name: string, deployment: () => Promise<void>, tests: (testEnv: TestEnv) => void) {
  describe(name, async () => {
    before(async () => {
      await rawBRE.run('set-DRE');
      await deployment();
      setBuidlerevmSnapshotId(await evmSnapshot());
    });
    tests(testEnv);
    after(async () => {
      await evmRevert(buidlerevmSnapshotId);
    })
  });
}
