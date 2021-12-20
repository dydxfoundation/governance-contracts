import BNJS from 'bignumber.js';
import { BigNumber, EventFilter, Event, utils } from 'ethers';
import { formatEther } from 'ethers/lib/utils';

import { DydxToken__factory, MerkleDistributorV1__factory } from '../../../types';
import { DydxToken } from '../../../types/DydxToken';
import { MerkleDistributorV1 } from '../../../types/MerkleDistributorV1';
import BalanceTree from '../../merkle-tree-helpers/balance-tree';
import {
  merkleDistributorAddresses,
} from '../config';
import {
  Configuration,
  eEthereumTxType,
  Network,
  tMerkleDistributorAddresses,
  tStringDecimalUnits,
  EthereumTransactionTypeExtended,
  transactionType,
  tEthereumAddress,
} from '../types';
import {
  ProposedRootMetadata,
  UserRewardsBalancesPerEpoch,
  UserRewardBalances,
  UserRewardsPerEpoch,
  UserRewardsData,
  EpochData,
  MerkleProof,
  RootUpdatedMetadata,
  ActiveRootDataAndHistory,
  ActiveMerkleTree,
} from '../types/GovernanceReturnTypes';
import { getMerkleTreeBalancesFromIpfs } from '../utils/ipfs';
import BaseService from './BaseService';
import ERC20Service from './ERC20';

export default class MerkleDistributor extends BaseService<MerkleDistributorV1> {

  readonly merkleDistributorAddress: string;
  readonly erc20Service: ERC20Service;
  private _rewardToken: string | null;
  private _activeRootDataAndHistory: ActiveRootDataAndHistory;
  private _proposedRootMetadata: ProposedRootMetadata;
  private _transfersRestrictedBefore: number | null;

  constructor(
    config: Configuration,
    erc20Service: ERC20Service,
    hardhatMerkleDistributorAddresses?: tMerkleDistributorAddresses,
  ) {
    super(config, MerkleDistributorV1__factory);
    this.erc20Service = erc20Service;
    this._rewardToken = null;
    this._activeRootDataAndHistory = {
      userBalancesPerEpoch: {},
      activeMerkleTree: null,
    };
    this._proposedRootMetadata = {
      balances: {},
      ipfsCid: '',
    };
    this._transfersRestrictedBefore = null;

    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (isHardhatNetwork && !hardhatMerkleDistributorAddresses) {
      throw new Error('Must specify merkle distributor addresses when on hardhat network');
    }
    this.merkleDistributorAddress = isHardhatNetwork
      ? hardhatMerkleDistributorAddresses!.MERKLE_DISTRIBUTOR_ADDRESS
      : merkleDistributorAddresses[network].MERKLE_DISTRIBUTOR_ADDRESS;
  }

  get contract(): MerkleDistributorV1 {
    return this.getContractInstance(this.merkleDistributorAddress);
  }

  private async getActiveRootData(): Promise<ActiveRootDataAndHistory> {
    const rootUpdatedFilter: EventFilter = this.contract.filters.RootUpdated(null, null, null);

    const rootUpdatedEvents: Event[] = await this.contract.queryFilter(rootUpdatedFilter);

    if (!rootUpdatedEvents.length) {
      // if no root has been set to active on the contract yet, show 0 rewards
      return this._activeRootDataAndHistory;
    }

    await Promise.all(rootUpdatedEvents.map(async (rootUpdatedEvent: Event) => {
      const eventArgs = rootUpdatedEvent.args!;
      const epoch: number = eventArgs.epoch.toNumber();
      const ipfsCid: string = eventArgs.ipfsCid;

      if (!(epoch in this._activeRootDataAndHistory.userBalancesPerEpoch)) {
        // fetch user balances from IPFS for this epoch
        const balances: UserRewardBalances = await getMerkleTreeBalancesFromIpfs(ipfsCid, this.config.ipfsTimeoutMs);
        this._activeRootDataAndHistory.userBalancesPerEpoch[epoch] = balances;
      }
    }));

    const lastRootUpdatedEpoch: number = rootUpdatedEvents.length - 1;
    // active merkle tree must exist if there was a root update event, update if needed
    this._activeRootDataAndHistory.activeMerkleTree = this.getActiveMerkleTree(
      this._activeRootDataAndHistory.userBalancesPerEpoch[lastRootUpdatedEpoch],
      lastRootUpdatedEpoch,
    );

    return this._activeRootDataAndHistory;
  }

  private getActiveMerkleTree(
    activeRootEpochBalances: UserRewardBalances,
    activeRootEpoch: number, 
  ): ActiveMerkleTree {
    let currentMerkleTreeData: ActiveMerkleTree | null = this._activeRootDataAndHistory.activeMerkleTree;

    if (!currentMerkleTreeData || activeRootEpoch > currentMerkleTreeData!.epoch) {
      const merkleTree: BalanceTree = new BalanceTree(activeRootEpochBalances);
      currentMerkleTreeData = {
        epoch: activeRootEpoch,
        merkleTree,
      };
    }

    return currentMerkleTreeData;
  }

  // this function should only be called if the merkle distributor has a pending root
  private async getProposedRootBalances(): Promise<ProposedRootMetadata> {
    const proposedRootData: {
      ipfsCid: string,
    } = await this.contract.getProposedRoot();

    const ipfsCid: string = proposedRootData.ipfsCid;
    if (ipfsCid === '0x') {
      throw new Error('Proposed root IPFS CID is unset');
    }

    if (ipfsCid !== this._proposedRootMetadata.ipfsCid) {
      // IPFS CID is different than previously stored IPFS CID, update proposed root metadata
      const balances: UserRewardBalances = await getMerkleTreeBalancesFromIpfs(ipfsCid, this.config.ipfsTimeoutMs);
      this._proposedRootMetadata = {
        balances,
        ipfsCid,
      };
    }

    return this._proposedRootMetadata;
  }

  private async hasPendingRoot(): Promise<boolean> {
    return this.contract.hasPendingRoot();
  }

  public async getRewardToken(): Promise<string> {
    if (!this._rewardToken) {
      this._rewardToken = await this.contract.REWARDS_TOKEN();
    }
    return this._rewardToken;
  }

  public async getTransfersRestrictedBefore(): Promise<number> {
    if (!this._transfersRestrictedBefore) {
      const rewardsTokenAddress: string = await this.getRewardToken();

      const { provider }: Configuration = this.config;
      const dydxToken: DydxToken = DydxToken__factory.connect(rewardsTokenAddress, provider);

      const transfersRestrictedBefore: BigNumber = await dydxToken._transfersRestrictedBefore();
      this._transfersRestrictedBefore = transfersRestrictedBefore.toNumber();
    }

    return this._transfersRestrictedBefore;
  }

  public async getActiveRootMerkleProof(user: tEthereumAddress): Promise<MerkleProof> {
    const checksummedAddress: string = utils.getAddress(user);
    const activeRootDataAndHistory: ActiveRootDataAndHistory = await this.getActiveRootData();

    const activeMerkleTree: ActiveMerkleTree | null = activeRootDataAndHistory.activeMerkleTree;

    if (!activeMerkleTree) {
      // no root has been promoted to active on merkle distributor
      return {
        cumulativeAmount: BigNumber.from(0),
        merkleProof: [],
      };
    }

    const userBalancesPerEpoch: UserRewardsBalancesPerEpoch = activeRootDataAndHistory.userBalancesPerEpoch;
    const activeRootEpoch: number = activeMerkleTree.epoch;

    if (!(activeRootEpoch in userBalancesPerEpoch)) {
      throw Error(`Balances were not found for epoch ${activeRootEpoch}`);
    }
    
    if (!(checksummedAddress in userBalancesPerEpoch[activeRootEpoch])) {
      // user has no trading rewards
      return {
        cumulativeAmount: BigNumber.from(0),
        merkleProof: [],
      };
    }

    const cumulativeAmount: BigNumber = userBalancesPerEpoch[activeRootEpoch][checksummedAddress];
    const merkleProof: Buffer[] = activeMerkleTree.merkleTree.getProof(checksummedAddress, cumulativeAmount);

    return {
      cumulativeAmount,
      merkleProof,
    };
  }

  public async claimRewards(user: tEthereumAddress): Promise<EthereumTransactionTypeExtended[]> {
    const checksummedAddress: string = utils.getAddress(user);
    const merkleProof: MerkleProof = await this.getActiveRootMerkleProof(checksummedAddress);
    if (!merkleProof.merkleProof.length) {
      throw new Error('User not found in the Merkle tree');
    }

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        this.contract.populateTransaction.claimRewards(merkleProof.cumulativeAmount, merkleProof.merkleProof),
      from: user,
      gasSurplus: 20,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.MERKLE_DISTRIBUTOR_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  public async getRootUpdatedMetadata(): Promise<RootUpdatedMetadata> {
    const rootUpdatedEventFilter: EventFilter = this.contract.filters.RootUpdated(null, null, null);
    const rootUpdatedEvents: Event[] = await this.contract.queryFilter(rootUpdatedEventFilter);
    
    if (rootUpdatedEvents.length === 0) {
      // root hasn't been updated yet
      return {
        lastRootUpdatedTimestamp: 0,
        numRootUpdates: 0,
      };
    }

    const lastRootUpdatedEvent: Event = rootUpdatedEvents[rootUpdatedEvents.length - 1];
    const rootUpdatedBlock = await lastRootUpdatedEvent.getBlock();
    return {
      lastRootUpdatedTimestamp: rootUpdatedBlock.timestamp,
      numRootUpdates: rootUpdatedEvents.length,
    };
  }

  public async getUserRewardsData(user: tEthereumAddress): Promise<UserRewardsData> {
    const checksummedAddress: string = utils.getAddress(user);
    const [
      claimedRewardsWei,
      hasPendingRoot,
      { userBalancesPerEpoch },
      epochData,
    ]: [
      BigNumber,
      boolean,
      ActiveRootDataAndHistory,
      EpochData,
    ] = await Promise.all([
      this.contract.getClaimed(checksummedAddress),
      this.hasPendingRoot(),
      this.getActiveRootData(),
      this.getEpochData(),
    ]);

    const rewardsPerEpoch: UserRewardsPerEpoch = {};
    let currentActiveRootRewards: BigNumber = BigNumber.from(0);

    // Should have a rewards balance entry for each active root update
    const numRootUpdates: number = Object.keys(userBalancesPerEpoch).length;
    const lastEpoch: number = numRootUpdates - 1;

    for (let i = 0; i < numRootUpdates; i++) {
      if (!(i in userBalancesPerEpoch)) {
        console.error(`Data for epoch ${i} not found`);
      }

      const epochRewards: UserRewardBalances = userBalancesPerEpoch[i];
      const userEpochRewards: BigNumber = checksummedAddress in epochRewards
        ? epochRewards[checksummedAddress]
        : BigNumber.from(0);
      rewardsPerEpoch[i] = formatEther(userEpochRewards);

      if (i === lastEpoch) {
        // on last root update, record current active root rewards to calculate new pending root rewards
        currentActiveRootRewards = userEpochRewards;
      }
    }

    let newPendingRootRewards: tStringDecimalUnits = '0.0';
    let waitingPeriodEnd: number = 0;
    if (hasPendingRoot) {
      const [
        waitingPeriodEndBN,
        proposedRootMetadata,
      ]: [
        BigNumber,
        ProposedRootMetadata,
      ] = await Promise.all([
        this.contract.getWaitingPeriodEnd(),
        this.getProposedRootBalances(),
      ]);

      waitingPeriodEnd = waitingPeriodEndBN.toNumber();
      const pendingRootBalances: UserRewardBalances = proposedRootMetadata.balances;
      if (checksummedAddress in pendingRootBalances) {
        newPendingRootRewards = formatEther(pendingRootBalances[checksummedAddress].sub(currentActiveRootRewards));
      }
    }

    return {
      rewardsPerEpoch,
      claimedRewards: formatEther(claimedRewardsWei),
      pendingRootData: {
        hasPendingRoot,
        waitingPeriodEnd,
      },
      newPendingRootRewards,
      epochData,
    };
  }

  // Meant to be used for testing purposes only
  public clearCachedRewardsData(): void {
    this._activeRootDataAndHistory = {
      userBalancesPerEpoch: {},
      activeMerkleTree: null,
    };
    this._proposedRootMetadata = {
      balances: {},
      ipfsCid: '',
    };
  }

  public async getEpochData(): Promise<EpochData> {
    const [
      epochParams,
      waitingPeriodLength,
      currentBlocktime,
    ]: [
      { interval: BigNumber, offset: BigNumber },
      BigNumber,
      number,
    ] = await Promise.all([
      this.contract.getEpochParameters(),
      this.contract.WAITING_PERIOD(),
      this.timeLatest(),
    ]);

    const epochZeroStart: BigNumber = epochParams.offset;

    const epochLength: number = epochParams.interval.toNumber();

    const secondsSinceEpochZero: BNJS = new BNJS(currentBlocktime).minus(epochZeroStart.toNumber());

    const currentEpoch: number = secondsSinceEpochZero
      .dividedToIntegerBy(epochLength)
      .toNumber();

    const startOfEpochTimestamp: number = epochZeroStart.add(epochParams.interval.mul(currentEpoch)).toNumber();
    const endOfEpochTimestamp: number = epochZeroStart.add(epochParams.interval.mul(currentEpoch + 1)).toNumber();

    return {
      epochLength,
      currentEpoch,
      startOfEpochTimestamp,
      endOfEpochTimestamp,
      waitingPeriodLength: waitingPeriodLength.toNumber(),
    };
  }
}
