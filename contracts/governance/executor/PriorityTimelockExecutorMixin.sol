// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { IPriorityTimelockExecutor } from '../../interfaces/IPriorityTimelockExecutor.sol';
import { IDydxGovernor } from '../../interfaces/IDydxGovernor.sol';

/**
 * @title PriorityTimelockExecutorMixin
 * @author dYdX
 *
 * @notice Time-locked executor contract mixin, inherited by the PriorityExecutor contract.
 *
 *  This contract adds the priority period and priority controller features to the
 *  ExecutorWithTimelockMixin contract.
 *
 *  Each governance proposal contains information about one or more proposed transactions. This
 *  contract is responsible for queueing, executing, and/or canceling the transactions of
 *  successful proposals. Once a transaction is queued, it can be executed after the delay has
 *  elapsed, as long as the grace period has not expired.
 */
contract PriorityTimelockExecutorMixin is
  IPriorityTimelockExecutor
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

  /// @dev Addresses which may unlock proposals for execution during the priority period.
  mapping(address => bool) private _isPriorityController;

  /// @dev Minimum time between queueing and execution of a proposal, in seconds.
  uint256 internal _delay;

  /// @dev Time at end of the delay period during which priority controllers may unlock
  ///  transactions for early execution, in seconds.
  uint256 private _priorityPeriod;

  mapping(bytes32 => bool) private _queuedTransactions;
  mapping(bytes32 => bool) private _priorityUnlockedTransactions;

  // ============ Constructor ============

  /**
   * @notice Constructor.
   *
   * @param  admin               The address which may queue, executed, and cancel transactions.
   *                             THis should be set to the governor contract address.
   * @param  delay               Minimum time between queueing and execution of a proposal, seconds.
   * @param  gracePeriod         Period of time after `_delay` in which a proposal can be executed,
   *                             in seconds.
   * @param  minimumDelay        Minimum allowed `_delay`, inclusive, in seconds.
   * @param  maximumDelay        Maximum allowed `_delay`, inclusive, in seconds.
   * @param  priorityPeriod      Time at end of the delay period during which priority controllers
   *                             may unlock transactions for early execution, in seconds.
   * @param  priorityController  Addresses which may unlock proposals for execution during the
   *                             priority period.
   */
  constructor(
    address admin,
    uint256 delay,
    uint256 gracePeriod,
    uint256 minimumDelay,
    uint256 maximumDelay,
    uint256 priorityPeriod,
    address priorityController
  ) {
    require(
      delay >= minimumDelay,
      'DELAY_SHORTER_THAN_MINIMUM'
    );
    require(
      delay <= maximumDelay,
      'DELAY_LONGER_THAN_MAXIMUM'
    );
    _validatePriorityPeriod(delay, priorityPeriod);
    _delay = delay;
    _priorityPeriod = priorityPeriod;
    _admin = admin;

    GRACE_PERIOD = gracePeriod;
    MINIMUM_DELAY = minimumDelay;
    MAXIMUM_DELAY = maximumDelay;

    emit NewDelay(delay);
    emit NewPriorityPeriod(priorityPeriod);
    emit NewAdmin(admin);

    _updatePriorityController(priorityController, true);
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

  modifier onlyPriorityController() {
    require(
      _isPriorityController[msg.sender],
      'ONLY_BY_PRIORITY_CONTROLLER'
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
    _validatePriorityPeriod(delay, _priorityPeriod);
    _delay = delay;
    emit NewDelay(delay);
  }

  /**
   * @notice Set the priority period.
   *
   * @param  priorityPeriod  Time at end of the delay period during which priority controllers may
   *                         unlock transactions for early execution, in seconds.
   */
  function setPriorityPeriod(
    uint256 priorityPeriod
  )
    public
    onlyTimelock
  {
    _validatePriorityPeriod(_delay, priorityPeriod);
    _priorityPeriod = priorityPeriod;
    emit NewPriorityPeriod(priorityPeriod);
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
   * @dev Add or remove a priority controller.
   */
  function updatePriorityController(
    address account,
    bool isPriorityController
  )
    public
    onlyTimelock
  {
    _updatePriorityController(account, isPriorityController);
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
      block.timestamp <= executionTime.add(GRACE_PERIOD),
      'GRACE_PERIOD_FINISHED'
    );

    // Require that either:
    //  - The timelock elapsed; OR
    //  - The transaction was unlocked by a priority controller, and we are in the priority
    //    execution window.
    if (_priorityUnlockedTransactions[actionHash]) {
      require(
        block.timestamp >= executionTime.sub(_priorityPeriod),
        'NOT_IN_PRIORITY_WINDOW'
      );
    } else {
      require(
        block.timestamp >= executionTime,
        'TIMELOCK_NOT_FINISHED'
      );
    }

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
   * @notice Function, called by a priority controller, to lock or unlock a proposal for execution
   *  during the priority period.
   *
   * @param  actionHash              Hash of the action.
   * @param  isUnlockedForExecution  Whether the proposal is executable during the priority period.
   */
  function setTransactionPriorityStatus(
    bytes32 actionHash,
    bool isUnlockedForExecution
  )
    public
    onlyPriorityController
  {
    require(
      _queuedTransactions[actionHash],
      'ACTION_NOT_QUEUED'
    );
    _priorityUnlockedTransactions[actionHash] = isUnlockedForExecution;
    emit UpdatedActionPriorityStatus(actionHash, isUnlockedForExecution);
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
   * @notice Get the priority period, which is the period of time before the end of the timelock
   *  delay during which a transaction can be unlocked for early execution by a priority controller.
   *
   * @return The priority period in seconds.
   */
  function getPriorityPeriod()
    external
    view
    returns (uint256)
  {
    return _priorityPeriod;
  }

  /**
   * @notice Check whether an address is a priority controller.
   *
   * @param  account  Address to check.
   *
   * @return Boolean `true` if `account` is a priority controller, otherwise `false`.
   */
  function isPriorityController(
    address account
  )
    external
    view
    returns (bool)
  {
    return _isPriorityController[account];
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
   * @notice Check whether an action is unlocked for early execution during the priority period.
   *
   * @param  actionHash  Hash of the action to be checked. Calculated as keccak256(abi.encode(
   *                     target, value, signature, data, executionTime, withDelegatecall)).
   *
   * @return Boolean `true` if the underlying action of `actionHash` is unlocked, otherwise `false`.
   */
  function hasPriorityStatus(
    bytes32 actionHash
  )
    external
    view
    returns (bool)
  {
    return _priorityUnlockedTransactions[actionHash];
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

  function _updatePriorityController(
    address account,
    bool isPriorityController
  )
    internal
  {
    _isPriorityController[account] = isPriorityController;
    emit PriorityControllerUpdated(account, isPriorityController);
  }

  function _validateDelay(
    uint256 delay
  )
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

  function _validatePriorityPeriod(
    uint256 delay,
    uint256 priorityPeriod
  )
    internal
    view
  {
    require(
      priorityPeriod <= delay,
      'PRIORITY_PERIOD_LONGER_THAN_DELAY'
    );
  }

  // ============ Receive Function ============

  receive()
    external
    payable
  {}
}
