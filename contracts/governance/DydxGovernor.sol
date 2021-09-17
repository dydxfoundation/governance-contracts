// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { AccessControl } from '../dependencies/open-zeppelin/AccessControl.sol';
import { SafeMath } from '../dependencies/open-zeppelin/SafeMath.sol';
import { IDydxGovernor } from '../interfaces/IDydxGovernor.sol';
import { IExecutorWithTimelock } from '../interfaces/IExecutorWithTimelock.sol';
import { IGovernanceStrategy } from '../interfaces/IGovernanceStrategy.sol';
import { IProposalValidator } from '../interfaces/IProposalValidator.sol';
import { IVotingStrategy } from '../interfaces/IVotingStrategy.sol';
import { isContract, getChainId } from './Helpers.sol';

/**
 * @title DydxGovernor
 * @author dYdX
 *
 * @notice Main point of interaction for dYdX governance. Holds governance proposals. Delegates to
 *  the governance strategy contract to determine how voting and proposing powers are counted. The
 *  content of a proposal is a sequence of function calls. These function calls must be made
 *  through authorized executor contracts.
 *
 *  Functionality includes:
 *    - Create a proposal
 *    - Cancel a proposal
 *    - Queue a proposal
 *    - Execute a proposal
 *    - Submit a vote to a proposal
 *
 *  Proposal state transitions in success case:
 *
 *    Pending => Active => Succeeded => Queued => Executed
 *
 *  Proposal state transitions in failure cases:
 *
 *    Pending => Active => Failed
 *    Pending => Active => Succeeded => Queued => Expired
 *    Pending => Canceled
 *    Pending => Active => Canceled
 *    Pending => Active => Succeeded => Canceled
 *    Pending => Active => Succeeded => Queued => Canceled
 */
contract DydxGovernor is
  AccessControl,
  IDydxGovernor
{
  using SafeMath for uint256;

  // ============ Structs ============

  /// @dev Utility struct used to hold local variables.
  struct CreateVars {
    uint256 startBlock;
    uint256 endBlock;
    uint256 previousProposalsCount;
  }

  // ============ Constants ============

  bytes32 public constant OWNER_ROLE = keccak256('OWNER_ROLE');
  bytes32 public constant ADD_EXECUTOR_ROLE = keccak256('ADD_EXECUTOR_ROLE');
  bytes32 public constant DOMAIN_TYPEHASH = keccak256(
    'EIP712Domain(string name,uint256 chainId,address verifyingContract)'
  );
  bytes32 public constant VOTE_EMITTED_TYPEHASH = keccak256(
    'VoteEmitted(uint256 id,bool support)'
  );
  string public constant EIP712_DOMAIN_NAME = 'dYdX Governance';

  // ============ Storage ============

  /// @dev The governance strategy contract which determines how votes are counted.
  address private _governanceStrategy;

  /// @dev Time period after proposal creation before voting power is snapshotted and voting begins.
  ///  Denominated in blocks.
  uint256 private _votingDelay;

  /// @dev The number of proposals that have been created.
  uint256 private _proposalsCount;

  /// @dev Mapping from serial ID to the proposal data.
  mapping(uint256 => Proposal) private _proposals;

  /// @dev Mapping of addresses which are authorized as executors that can be used by a proposal.
  mapping(address => bool) private _authorizedExecutors;

  // ============ Constructor ============

  constructor(
    address governanceStrategy,
    uint256 votingDelay,
    address addExecutorAdmin
  ) {
    _setGovernanceStrategy(governanceStrategy);
    _setVotingDelay(votingDelay);

    // Assign roles.
    _setupRole(OWNER_ROLE, msg.sender);
    _setupRole(ADD_EXECUTOR_ROLE, addExecutorAdmin);

    // Set OWNER_ROLE as the admin for all roles.
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(ADD_EXECUTOR_ROLE, OWNER_ROLE);
  }

  // ============ External and Public Functions ============

  /**
   * @notice Create a proposal, subject to validation by the specified executor.
   *
   *  The content of a proposal is a sequence of transactions. Each transaction has associated
   *  parameters, passed to this function via the array parameters.
   *
   * @param  executor           The executor contract that will validate and execute the proposal.
   * @param  targets            Target address for each tx.
   * @param  values             Value in wei for each tx.
   * @param  signatures         Optional function signature for each tx, added to calldata.
   * @param  calldatas          Calldata for each tx.
   * @param  withDelegatecalls  Boolean `true` if delegatecall should be used, else call is used.
   * @param  ipfsHash           IPFS hash of the proposal metadata.
   */
  function create(
    IExecutorWithTimelock executor,
    address[] memory targets,
    uint256[] memory values,
    string[] memory signatures,
    bytes[] memory calldatas,
    bool[] memory withDelegatecalls,
    bytes32 ipfsHash
  )
    external
    override
    returns (uint256)
  {
    require(
      targets.length != 0,
      'INVALID_EMPTY_TARGETS'
    );
    require(
      (
        targets.length == values.length &&
        targets.length == signatures.length &&
        targets.length == calldatas.length &&
        targets.length == withDelegatecalls.length
      ),
      'INCONSISTENT_PARAMS_LENGTH'
    );
    require(
      isExecutorAuthorized(address(executor)),
      'EXECUTOR_NOT_AUTHORIZED'
    );
    require(
      IProposalValidator(address(executor)).validateCreatorOfProposal(
        this,
        msg.sender,
        block.number - 1
      ),
      'PROPOSITION_CREATION_INVALID'
    );

    CreateVars memory vars;

    vars.startBlock = block.number.add(_votingDelay);
    vars.endBlock = vars.startBlock.add(IProposalValidator(address(executor)).VOTING_DURATION());

    vars.previousProposalsCount = _proposalsCount;

    Proposal storage newProposal = _proposals[vars.previousProposalsCount];
    newProposal.id = vars.previousProposalsCount;
    newProposal.creator = msg.sender;
    newProposal.executor = executor;
    newProposal.targets = targets;
    newProposal.values = values;
    newProposal.signatures = signatures;
    newProposal.calldatas = calldatas;
    newProposal.withDelegatecalls = withDelegatecalls;
    newProposal.startBlock = vars.startBlock;
    newProposal.endBlock = vars.endBlock;
    newProposal.strategy = _governanceStrategy;
    newProposal.ipfsHash = ipfsHash;
    _proposalsCount = vars.previousProposalsCount + 1;

    emit ProposalCreated(
      vars.previousProposalsCount,
      msg.sender,
      executor,
      targets,
      values,
      signatures,
      calldatas,
      withDelegatecalls,
      vars.startBlock,
      vars.endBlock,
      _governanceStrategy,
      ipfsHash
    );

    return newProposal.id;
  }

  /**
   * @notice Cancel a proposal. Callable by anyone if the conditions on the executor are fulfilled.
   *
   * @param  proposalId  ID of the proposal.
   */
  function cancel(
    uint256 proposalId
  )
    external
    override
  {
    ProposalState state = getProposalState(proposalId);
    require(
      (
        state != ProposalState.Canceled &&
        state != ProposalState.Failed &&
        state != ProposalState.Expired &&
        state != ProposalState.Executed
      ),
      'ONLY_BEFORE_EXECUTED'
    );

    Proposal storage proposal = _proposals[proposalId];
    require(
      IProposalValidator(address(proposal.executor)).validateProposalCancellation(
        this,
        proposal.creator,
        block.number - 1
      ),
      'PROPOSITION_CANCELLATION_INVALID'
    );
    proposal.canceled = true;
    for (uint256 i = 0; i < proposal.targets.length; i++) {
      proposal.executor.cancelTransaction(
        proposal.targets[i],
        proposal.values[i],
        proposal.signatures[i],
        proposal.calldatas[i],
        proposal.executionTime,
        proposal.withDelegatecalls[i]
      );
    }

    emit ProposalCanceled(proposalId);
  }

  /**
   * @notice Queue the proposal. Requires that the proposal succeeded.
   *
   * @param  proposalId  ID of the proposal to queue.
   */
  function queue(
    uint256 proposalId
  )
    external
    override
  {
    require(
      getProposalState(proposalId) == ProposalState.Succeeded,
      'INVALID_STATE_FOR_QUEUE'
    );
    Proposal storage proposal = _proposals[proposalId];
    uint256 executionTime = block.timestamp.add(proposal.executor.getDelay());
    for (uint256 i = 0; i < proposal.targets.length; i++) {
      _queueOrRevert(
        proposal.executor,
        proposal.targets[i],
        proposal.values[i],
        proposal.signatures[i],
        proposal.calldatas[i],
        executionTime,
        proposal.withDelegatecalls[i]
      );
    }
    proposal.executionTime = executionTime;

    emit ProposalQueued(proposalId, executionTime, msg.sender);
  }

  /**
   * @notice Execute the proposal. Requires that the proposal is queued.
   *
   * @param  proposalId  ID of the proposal to execute.
   */
  function execute(
    uint256 proposalId
  )
    external
    payable
    override
  {
    require(
      getProposalState(proposalId) == ProposalState.Queued,
      'ONLY_QUEUED_PROPOSALS'
    );
    Proposal storage proposal = _proposals[proposalId];
    proposal.executed = true;
    for (uint256 i = 0; i < proposal.targets.length; i++) {
      proposal.executor.executeTransaction{value: proposal.values[i]}(
        proposal.targets[i],
        proposal.values[i],
        proposal.signatures[i],
        proposal.calldatas[i],
        proposal.executionTime,
        proposal.withDelegatecalls[i]
      );
    }
    emit ProposalExecuted(proposalId, msg.sender);
  }

  /**
   * @notice Vote in favor of or against a proposal.
   *
   * @param  proposalId  ID of the proposal.
   * @param  support     Boolean, `true` to vote in favor, `false` to vote against.
   */
  function submitVote(
    uint256 proposalId,
    bool support
  )
    external
    override
  {
    return _submitVote(msg.sender, proposalId, support);
  }

  /**
   * @notice Register the vote of a user that voted off-chain via signature.
   *
   * @param  proposalId  ID of the proposal
   * @param  support     Boolean, `true` to vote in favor, `false` to vote against.
   * @param  v           Signature param.
   * @param  r           Signature param.
   * @param  s           Signature param.
   */
  function submitVoteBySignature(
    uint256 proposalId,
    bool support,
    uint8 v,
    bytes32 r,
    bytes32 s
  )
    external
    override
  {
    bytes32 digest = keccak256(
      abi.encodePacked(
        '\x19\x01',
        keccak256(
          abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(EIP712_DOMAIN_NAME)),
            getChainId(),
            address(this)
          )
        ),
        keccak256(abi.encode(VOTE_EMITTED_TYPEHASH, proposalId, support))
      )
    );
    address signer = ecrecover(digest, v, r, s);
    require(
      signer != address(0),
      'INVALID_SIGNATURE'
    );
    return _submitVote(signer, proposalId, support);
  }

  /**
   * @notice Update the governance strategy contract address.
   *
   *  Note: Must be called by the owner, which should be a timelocked executor, so calls to this
   *  function should be made via a proposal.
   *
   * @param  governanceStrategy  New address of the governance strategy contract.
   */
  function setGovernanceStrategy(
    address governanceStrategy
  )
    external
    override
    onlyRole(OWNER_ROLE)
  {
    _setGovernanceStrategy(governanceStrategy);
  }

  /**
   * @notice Update the voting delay, which is the time period after proposal creation before
   *  voting power is snapshotted and voting begins.
   *
   *  Note: Must be called by the owner, which should be a timelocked executor, so calls to this
   *  function should be made via a proposal.
   *
   * @param  votingDelay  The new voting delay, denominated in blocks.
   */
  function setVotingDelay(
    uint256 votingDelay
  )
    external
    override
    onlyRole(OWNER_ROLE)
  {
    _setVotingDelay(votingDelay);
  }

  // ============ Public Functions ============

  /**
   * @notice Add new addresses to the list of authorized executors.
   *
   * @param  executors  List of new addresses to be authorized executors.
   */
  function authorizeExecutors(
    address[] memory executors
  )
    public
    override
    onlyRole(ADD_EXECUTOR_ROLE)
  {
    for (uint256 i = 0; i < executors.length; i++) {
      _authorizeExecutor(executors[i]);
    }
  }

  /**
   * @notice Remove addresses from the list of authorized executors.
   *
   * @param  executors  List of addresses to be removed as authorized executors.
   */
  function unauthorizeExecutors(
    address[] memory executors
  )
    public
    override
    onlyRole(OWNER_ROLE)
  {
    for (uint256 i = 0; i < executors.length; i++) {
      _unauthorizeExecutor(executors[i]);
    }
  }

  /**
   * @notice Get the current governance strategy contract address.
   *
   * @return The address of the current governance strategy contract.
   */
  function getGovernanceStrategy()
    external
    view
    override
    returns (address)
  {
    return _governanceStrategy;
  }

  /**
   * @notice Get the current voting delay, which is the time period after proposal creation before
   *  voting power is snapshotted and voting begins.
   *
   * @return The voting delay, denominated in blocks.
   */
  function getVotingDelay()
    external
    view
    override
    returns (uint256)
  {
    return _votingDelay;
  }

  /**
   * @notice Check whether an address is an authorized executor
   *
   * @param  executor  Address to check.
   *
   * @return Boolean `true` if address is an authorized executor, otherwise `false`.
   */
  function isExecutorAuthorized(
    address executor
  )
    public
    view
    override
    returns (bool)
  {
    return _authorizedExecutors[executor];
  }

  /**
   * @notice Get the number of proposals that have ever been created.
   *
   * @return The number of proposals that have ever been created.
   */
  function getProposalsCount()
    external
    view
    override
    returns (uint256)
  {
    return _proposalsCount;
  }

  /**
   * @notice Get information about a proposal, by proposal ID.
   *
   * @param  proposalId  ID of the proposal.
   *
   * @return The proposal data as a ProposalWithoutVotes struct.
   */
  function getProposalById(
    uint256 proposalId
  )
    external
    view
    override
    returns (ProposalWithoutVotes memory)
  {
    Proposal storage proposal = _proposals[proposalId];
    ProposalWithoutVotes memory proposalWithoutVotes = ProposalWithoutVotes({
      id: proposal.id,
      creator: proposal.creator,
      executor: proposal.executor,
      targets: proposal.targets,
      values: proposal.values,
      signatures: proposal.signatures,
      calldatas: proposal.calldatas,
      withDelegatecalls: proposal.withDelegatecalls,
      startBlock: proposal.startBlock,
      endBlock: proposal.endBlock,
      executionTime: proposal.executionTime,
      forVotes: proposal.forVotes,
      againstVotes: proposal.againstVotes,
      executed: proposal.executed,
      canceled: proposal.canceled,
      strategy: proposal.strategy,
      ipfsHash: proposal.ipfsHash
    });

    return proposalWithoutVotes;
  }

  /**
   * @notice Get information about a voter's vote on a proposal.
   *
   *  If the returned votingPower is zero, it can mean the voter's snapshotted voting power was
   *  zero, or that the voter has not yet submitted their vote.
   *
   * @param  proposalId  ID of the proposal.
   * @param  voter       Address of the voter.
   *
   * @return Vote information as a struct: { bool support, uint248 votingPower }.
   */
  function getVoteOnProposal(
    uint256 proposalId,
    address voter
  )
    external
    view
    override
    returns (Vote memory)
  {
    return _proposals[proposalId].votes[voter];
  }

  /**
   * @notice Query the current state of a proposal: Pending, Active, etc.
   *
   * @param  proposalId  ID of the proposal.
   *
   * @return The current state of the proposal as a ProposalState enum.
   */
  function getProposalState(
    uint256 proposalId
  )
    public
    view
    override
    returns (ProposalState)
  {
    require(
      _proposalsCount > proposalId,
      'INVALID_PROPOSAL_ID'
    );

    Proposal storage proposal = _proposals[proposalId];

    if (proposal.canceled) {
      return ProposalState.Canceled;
    } else if (block.number <= proposal.startBlock) {
      return ProposalState.Pending;
    } else if (block.number <= proposal.endBlock) {
      return ProposalState.Active;
    } else if (!IProposalValidator(address(proposal.executor)).isProposalPassed(this, proposalId)) {
      return ProposalState.Failed;
    } else if (proposal.executionTime == 0) {
      return ProposalState.Succeeded;
    } else if (proposal.executed) {
      return ProposalState.Executed;
    } else if (proposal.executor.isProposalOverGracePeriod(this, proposalId)) {
      return ProposalState.Expired;
    } else {
      return ProposalState.Queued;
    }
  }

  // ============ Internal Functions ============

  function _queueOrRevert(
    IExecutorWithTimelock executor,
    address target,
    uint256 value,
    string memory signature,
    bytes memory callData,
    uint256 executionTime,
    bool withDelegatecall
  )
    internal
  {
    require(
      !executor.isActionQueued(
        keccak256(abi.encode(target, value, signature, callData, executionTime, withDelegatecall))
      ),
      'DUPLICATED_ACTION'
    );
    executor.queueTransaction(target, value, signature, callData, executionTime, withDelegatecall);
  }

  function _submitVote(
    address voter,
    uint256 proposalId,
    bool support
  )
    internal
  {
    require(
      getProposalState(proposalId) == ProposalState.Active,
      'VOTING_CLOSED'
    );
    Proposal storage proposal = _proposals[proposalId];
    Vote storage vote = proposal.votes[voter];

    require(
      vote.votingPower == 0,
      'VOTE_ALREADY_SUBMITTED'
    );

    uint256 votingPower = IVotingStrategy(proposal.strategy).getVotingPowerAt(
      voter,
      proposal.startBlock
    );

    if (support) {
      proposal.forVotes = proposal.forVotes.add(votingPower);
    } else {
      proposal.againstVotes = proposal.againstVotes.add(votingPower);
    }

    vote.support = support;
    vote.votingPower = uint248(votingPower);

    emit VoteEmitted(proposalId, voter, support, votingPower);
  }

  function _setGovernanceStrategy(
    address governanceStrategy
  )
    internal
  {
    _governanceStrategy = governanceStrategy;
    emit GovernanceStrategyChanged(governanceStrategy, msg.sender);
  }

  function _setVotingDelay(
    uint256 votingDelay
  )
    internal
  {
    _votingDelay = votingDelay;
    emit VotingDelayChanged(votingDelay, msg.sender);
  }

  function _authorizeExecutor(
    address executor
  )
    internal
  {
    _authorizedExecutors[executor] = true;
    emit ExecutorAuthorized(executor);
  }

  function _unauthorizeExecutor(
    address executor
  )
    internal
  {
    _authorizedExecutors[executor] = false;
    emit ExecutorUnauthorized(executor);
  }
}
