// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { IDydxGovernor } from '../../interfaces/IDydxGovernor.sol';
import { IExecutorWithTimelock } from '../../interfaces/IExecutorWithTimelock.sol';

/**
 * @title ExecutorWithTimelockMixin
 * @author dYdX
 *
 * @notice Time-locked executor contract mixin, inherited by the governance Executor contract.
 *
 *  Each governance proposal contains information about one or more proposed transactions. This
 *  contract is responsible for queueing, executing, and/or canceling the transactions of
 *  successful proposals. Once a transaction is queued, it can be executed after the delay has
 *  elapsed, as long as the grace period has not expired.
 */
abstract contract ExecutorWithTimelockMixin is
  IExecutorWithTimelock
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice Period of time after `_delay` in which a proposal can be executed, in seconds.
  uint256 public immutable override GRACE_PERIOD;

  /// @notice Minimum allowed `_delay`, inclusive, in seconds.
  uint256 public immutable override MINIMUM_DELAY;

  /// @notice Maximum allowed `_delay`, inclusive, in seconds.
  uint256 public immutable override MAXIMUM_DELAY;

  // ============ Storage ============

  /// @dev The address which may queue, executed, and cancel transactions. This should be set to
  ///  the governor contract address.
  address internal _admin;

  /// @dev Pending admin, which must call acceptAdmin() in order to become the admin.
  address internal _pendingAdmin;

  /// @dev Minimum time between queueing and execution of a proposal, in seconds.
  uint256 internal _delay;

  /// @dev Mapping from (actionHash => isQueued) for transactions queued by this executor. The
  ///  action hash is a hash of the transaction parameters.
  mapping(bytes32 => bool) internal _queuedTransactions;

  // ============ Constructor ============

  /**
   * @notice Constructor.
   *
   * @param  admin         The address which may queue, executed, and cancel transactions. This
   *                       should be set to the governor contract address.
   * @param  delay         Minimum time between queueing and execution of a proposal, in seconds.
   * @param  gracePeriod   Period of time after `_delay` in which a proposal can be executed,
   *                       in seconds.
   * @param  minimumDelay  Minimum allowed `_delay`, inclusive, in seconds.
   * @param  maximumDelay  Maximum allowed `_delay`, inclusive, in seconds.
   */
  constructor(
    address admin,
    uint256 delay,
    uint256 gracePeriod,
    uint256 minimumDelay,
    uint256 maximumDelay
  ) {
    require(
      delay >= minimumDelay,
      'DELAY_SHORTER_THAN_MINIMUM'
    );
    require(
      delay <= maximumDelay,
      'DELAY_LONGER_THAN_MAXIMUM'
    );
    _delay = delay;
    _admin = admin;

    GRACE_PERIOD = gracePeriod;
    MINIMUM_DELAY = minimumDelay;
    MAXIMUM_DELAY = maximumDelay;

    emit NewDelay(delay);
    emit NewAdmin(admin);
  }

  // ============ Modifiers ============

  modifier onlyAdmin() {
    require(
      msg.sender == _admin,
      'ONLY_BY_ADMIN'
    );
    _;
  }

  modifier onlyTimelock() {
    require(
      msg.sender == address(this),
      'ONLY_BY_THIS_TIMELOCK'
    );
    _;
  }

  modifier onlyPendingAdmin() {
    require(
      msg.sender == _pendingAdmin,
      'ONLY_BY_PENDING_ADMIN'
    );
    _;
  }

  // ============ External and Public Functions ============

  /**
   * @notice Set the delay.
   *
   * @param  delay  Minimum time between queueing and execution of a proposal.
   */
  function setDelay(
    uint256 delay
  )
    public
    onlyTimelock
  {
    _validateDelay(delay);
    _delay = delay;
    emit NewDelay(delay);
  }

  /**
   * @notice Callable by a pending admin to become the admin.
   */
  function acceptAdmin()
    public
    onlyPendingAdmin
  {
    _admin = msg.sender;
    _pendingAdmin = address(0);
    emit NewAdmin(msg.sender);
  }

  /**
   * @notice Set the new pending admin. Can only be called by this executor (i.e. via a proposal).
   *
   * @param  newPendingAdmin  Address of the new admin.
   */
  function setPendingAdmin(
    address newPendingAdmin
  )
    public
    onlyTimelock
  {
    _pendingAdmin = newPendingAdmin;
    emit NewPendingAdmin(newPendingAdmin);
  }

  /**
   * @notice Called by the admin (i.e. governor) to enqueue a transaction. Returns the action hash.
   *
   * @param  target            Smart contract target of the transaction.
   * @param  value             Value to send with the transaction, in wei.
   * @param  signature         Function signature of the transaction (optional).
   * @param  data              Function arguments of the transaction, or the full calldata if
   *                           the `signature` param is empty.
   * @param  executionTime     Time at which the transaction should become executable.
   * @param  withDelegatecall  Boolean `true` if delegatecall should be used instead of call.
   *
   * @return The action hash of the enqueued transaction.
   */
  function queueTransaction(
    address target,
    uint256 value,
    string memory signature,
    bytes memory data,
    uint256 executionTime,
    bool withDelegatecall
  )
    public
    override
    onlyAdmin
    returns (bytes32)
  {
    require(
      executionTime >= block.timestamp.add(_delay),
      'EXECUTION_TIME_UNDERESTIMATED'
    );

    bytes32 actionHash = keccak256(
      abi.encode(target, value, signature, data, executionTime, withDelegatecall)
    );
    _queuedTransactions[actionHash] = true;

    emit QueuedAction(actionHash, target, value, signature, data, executionTime, withDelegatecall);
    return actionHash;
  }

  /**
   * @notice Called by the admin (i.e. governor) to cancel a transaction. Returns the action hash.
   *
   * @param  target            Smart contract target of the transaction.
   * @param  value             Value to send with the transaction, in wei.
   * @param  signature         Function signature of the transaction (optional).
   * @param  data              Function arguments of the transaction, or the full calldata if
   *                           the `signature` param is empty.
   * @param  executionTime     Time at which the transaction should become executable.
   * @param  withDelegatecall  Boolean `true` if delegatecall should be used instead of call.
   *
   * @return The action hash of the canceled transaction.
   */
  function cancelTransaction(
    address target,
    uint256 value,
    string memory signature,
    bytes memory data,
    uint256 executionTime,
    bool withDelegatecall
  )
    public
    override
    onlyAdmin
    returns (bytes32)
  {
    bytes32 actionHash = keccak256(
      abi.encode(target, value, signature, data, executionTime, withDelegatecall)
    );
    _queuedTransactions[actionHash] = false;

    emit CancelledAction(
      actionHash,
      target,
      value,
      signature,
      data,
      executionTime,
      withDelegatecall
    );
    return actionHash;
  }

  /**
   * @dev Called by the admin (i.e. governor) to execute a transaction. Returns the result.
   *
   * @param  target            Smart contract target of the transaction.
   * @param  value             Value to send with the transaction, in wei.
   * @param  signature         Function signature of the transaction (optional).
   * @param  data              Function arguments of the transaction, or the full calldata if
   *                           the `signature` param is empty.
   * @param  executionTime     Time at which the transaction should become executable.
   * @param  withDelegatecall  Boolean `true` if delegatecall should be used instead of call.
   *
   * @return The result of the transaction call.
   */
  function executeTransaction(
    address target,
    uint256 value,
    string memory signature,
    bytes memory data,
    uint256 executionTime,
    bool withDelegatecall
  )
    public
    payable
    override
    onlyAdmin
    returns (bytes memory)
  {
    bytes32 actionHash = keccak256(abi.encode(
      target,
      value,
      signature,
      data,
      executionTime,
      withDelegatecall
    ));
    require(
      _queuedTransactions[actionHash],
      'ACTION_NOT_QUEUED'
    );
    require(
      block.timestamp >= executionTime,
      'TIMELOCK_NOT_FINISHED'
    );
    require(
      block.timestamp <= executionTime.add(GRACE_PERIOD),
      'GRACE_PERIOD_FINISHED'
    );

    _queuedTransactions[actionHash] = false;

    bytes memory callData;

    if (bytes(signature).length == 0) {
      callData = data;
    } else {
      callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
    }

    bool success;
    bytes memory resultData;
    if (withDelegatecall) {
      require(
        msg.value >= value,
        'NOT_ENOUGH_MSG_VALUE'
      );
      (success, resultData) = target.delegatecall(callData);
    } else {
      (success, resultData) = target.call{value: value}(callData);
    }

    require(
      success,
      'FAILED_ACTION_EXECUTION'
    );

    emit ExecutedAction(
      actionHash,
      target,
      value,
      signature,
      data,
      executionTime,
      withDelegatecall,
      resultData
    );

    return resultData;
  }

  /**
   * @notice Get the current admin address (should be the governor contract).
   *
   * @return The address of the current admin.
   */
  function getAdmin()
    external
    view
    override
    returns (address)
  {
    return _admin;
  }

  /**
   * @notice Get the current pending admin address.
   *
   * @return The address of the pending admin.
   */
  function getPendingAdmin()
    external
    view
    override
    returns (address)
  {
    return _pendingAdmin;
  }

  /**
   * @notice Get the minimum time between queueing and execution of a proposal.
   *
   * @return The delay, in seconds.
   */
  function getDelay()
    external
    view
    override
    returns (uint256)
  {
    return _delay;
  }

  /**
   * @notice Check whether a given action is queued.
   *
   * @param  actionHash  Hash of the action to be checked. Calculated as keccak256(abi.encode(
   *                     target, value, signature, data, executionTime, withDelegatecall)).
   *
   * @return Boolean `true` if the underlying action of `actionHash` is queued, otherwise `false`.
   */
  function isActionQueued(
    bytes32 actionHash
  )
    external
    view
    override
    returns (bool)
  {
    return _queuedTransactions[actionHash];
  }

  /**
   * @notice Check whether a proposal has exceeded its grace period.
   *
   * @param  governor    The governor contract.
   * @param  proposalId  ID of the proposal to check.
   *
   * @return Boolean `true` if proposal has exceeded its grace period, otherwise `false`.
   */
  function isProposalOverGracePeriod(
    IDydxGovernor governor,
    uint256 proposalId
  )
    external
    view
    override
    returns (bool)
  {
    IDydxGovernor.ProposalWithoutVotes memory proposal = governor.getProposalById(proposalId);

    return block.timestamp > proposal.executionTime.add(GRACE_PERIOD);
  }

  // ============ Internal Functions ============

  function _validateDelay(uint256 delay)
    internal
    view
  {
    require(
      delay >= MINIMUM_DELAY,
      'DELAY_SHORTER_THAN_MINIMUM'
    );
    require(
      delay <= MAXIMUM_DELAY,
      'DELAY_LONGER_THAN_MAXIMUM'
    );
  }

  // ============ Receive Function ============

  receive() external payable {}
}
