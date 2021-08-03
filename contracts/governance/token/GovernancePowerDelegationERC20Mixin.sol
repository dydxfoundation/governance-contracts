// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import { ERC20 } from '../../dependencies/open-zeppelin/ERC20.sol';
import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import {
  IGovernancePowerDelegationERC20
} from '../../interfaces/IGovernancePowerDelegationERC20.sol';

/**
 * @title GovernancePowerDelegationERC20Mixin
 * @author dYdX
 *
 * @notice Provides support for two types of governance powers, both endowed by the governance
 *  token, and separately delegatable. Provides functions for delegation and for querying a user's
 *  power at a certain block number.
 */
abstract contract GovernancePowerDelegationERC20Mixin is
  ERC20,
  IGovernancePowerDelegationERC20
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice EIP-712 typehash for delegation by signature of a specific governance power type.
  bytes32 public constant DELEGATE_BY_TYPE_TYPEHASH = keccak256(
    'DelegateByType(address delegatee,uint256 type,uint256 nonce,uint256 expiry)'
  );

  /// @notice EIP-712 typehash for delegation by signature of all governance powers.
  bytes32 public constant DELEGATE_TYPEHASH = keccak256(
    'Delegate(address delegatee,uint256 nonce,uint256 expiry)'
  );

  // ============ Structs ============

  /// @dev Snapshot of a value on a specific block, used to track voting power for proposals.
  struct Snapshot {
    uint128 blockNumber;
    uint128 value;
  }

  // ============ External Functions ============

  /**
   * @notice Delegates a specific governance power to a delegatee.
   *
   * @param  delegatee       The address to delegate power to.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   */
  function delegateByType(address delegatee, DelegationType delegationType)
    external
    override
  {
    _delegateByType(msg.sender, delegatee, delegationType);
  }

  /**
   * @notice Delegates all governance powers to a delegatee.
   *
   * @param  delegatee  The address to delegate power to.
   */
  function delegate(address delegatee)
    external
    override
  {
    _delegateByType(msg.sender, delegatee, DelegationType.VOTING_POWER);
    _delegateByType(msg.sender, delegatee, DelegationType.PROPOSITION_POWER);
  }

  /**
   * @notice Returns the delegatee of a user.
   *
   * @param  delegator       The address of the delegator.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   */
  function getDelegateeByType(address delegator, DelegationType delegationType)
    external
    override
    view
    returns (address)
  {
    (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);

    return _getDelegatee(delegator, delegates);
  }

  /**
   * @notice Returns the current power of a user. The current power is the power delegated
   *  at the time of the last snapshot.
   *
   * @param  user            The user whose power to query.
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   */
  function getPowerCurrent(address user, DelegationType delegationType)
    external
    override
    view
    returns (uint256)
  {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      // delegates
    ) = _getDelegationDataByType(delegationType);

    return _searchByBlockNumber(snapshots, snapshotsCounts, user, block.number);
  }

  /**
   * @notice Returns the power of a user at a certain block.
   *
   * @param  user            The user whose power to query.
   * @param  blockNumber     The block number at which to get the user's power.
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   */
  function getPowerAtBlock(
    address user,
    uint256 blockNumber,
    DelegationType delegationType
  ) external override view returns (uint256) {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      // delegates
    ) = _getDelegationDataByType(delegationType);

    return _searchByBlockNumber(snapshots, snapshotsCounts, user, blockNumber);
  }

  // ============ Internal Functions ============

  /**
   * @dev Delegates one specific power to a delegatee.
   *
   * @param  delegator       The user whose power to delegate.
   * @param  delegatee       The address to delegate power to.
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   */
  function _delegateByType(
    address delegator,
    address delegatee,
    DelegationType delegationType
  ) internal {
    require(delegatee != address(0), 'INVALID_DELEGATEE');

    (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);

    uint256 delegatorBalance = balanceOf(delegator);

    address previousDelegatee = _getDelegatee(delegator, delegates);

    delegates[delegator] = delegatee;

    _moveDelegatesByType(previousDelegatee, delegatee, delegatorBalance, delegationType);
    emit DelegateChanged(delegator, delegatee, delegationType);
  }

  /**
   * @dev Moves power from one user to another.
   *
   * @param  from            The user from which delegated power is moved.
   * @param  to              The user that will receive the delegated power.
   * @param  amount          The amount of power to be moved.
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   */
  function _moveDelegatesByType(
    address from,
    address to,
    uint256 amount,
    DelegationType delegationType
  ) internal {
    if (from == to) {
      return;
    }

    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      // delegates
    ) = _getDelegationDataByType(delegationType);

    if (from != address(0)) {
      uint256 previous = 0;
      uint256 fromSnapshotsCount = snapshotsCounts[from];

      if (fromSnapshotsCount != 0) {
        previous = snapshots[from][fromSnapshotsCount - 1].value;
      } else {
        previous = balanceOf(from);
      }

      uint256 newAmount = previous.sub(amount);
      _writeSnapshot(
        snapshots,
        snapshotsCounts,
        from,
        uint128(newAmount)
      );

      emit DelegatedPowerChanged(from, newAmount, delegationType);
    }

    if (to != address(0)) {
      uint256 previous = 0;
      uint256 toSnapshotsCount = snapshotsCounts[to];
      if (toSnapshotsCount != 0) {
        previous = snapshots[to][toSnapshotsCount - 1].value;
      } else {
        previous = balanceOf(to);
      }

      uint256 newAmount = previous.add(amount);
      _writeSnapshot(
        snapshots,
        snapshotsCounts,
        to,
        uint128(newAmount)
      );

      emit DelegatedPowerChanged(to, newAmount, delegationType);
    }
  }

  /**
   * @dev Searches for a balance snapshot by block number using binary search.
   *
   * @param  snapshots        The mapping of snapshots by user.
   * @param  snapshotsCounts  The mapping of the number of snapshots by user.
   * @param  user             The user for which the snapshot is being searched.
   * @param  blockNumber      The block number being searched.
   */
  function _searchByBlockNumber(
    mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
    mapping(address => uint256) storage snapshotsCounts,
    address user,
    uint256 blockNumber
  ) internal view returns (uint256) {
    require(blockNumber <= block.number, 'INVALID_BLOCK_NUMBER');

    uint256 snapshotsCount = snapshotsCounts[user];

    if (snapshotsCount == 0) {
      return balanceOf(user);
    }

    // First check most recent balance
    if (snapshots[user][snapshotsCount - 1].blockNumber <= blockNumber) {
      return snapshots[user][snapshotsCount - 1].value;
    }

    // Next check implicit zero balance
    if (snapshots[user][0].blockNumber > blockNumber) {
      return 0;
    }

    uint256 lower = 0;
    uint256 upper = snapshotsCount - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      Snapshot memory snapshot = snapshots[user][center];
      if (snapshot.blockNumber == blockNumber) {
        return snapshot.value;
      } else if (snapshot.blockNumber < blockNumber) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return snapshots[user][lower].value;
  }

  /**
   * @dev Returns delegation data (snapshot, snapshotsCount, delegates) by delegation type.
   *
   *  Note: This mixin contract does not itself define any storage, and we require the inheriting
   *  contract to implement this method to provide access to the relevant mappings in storage.
   *  This pattern was implemented by Aave for legacy reasons and we have decided not to change it.
   *
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   */
  function _getDelegationDataByType(DelegationType delegationType)
    internal
    virtual
    view
    returns (
      mapping(address => mapping(uint256 => Snapshot)) storage, // snapshots
      mapping(address => uint256) storage, // snapshotsCount
      mapping(address => address) storage // delegates
    );

  /**
   * @dev Writes a snapshot of a user's token/power balance.
   *
   * @param  snapshots        The mapping of snapshots by user.
   * @param  snapshotsCounts  The mapping of the number of snapshots by user.
   * @param  owner            The user whose power to snapshot.
   * @param  newValue         The new balance to snapshot at the current block.
   */
  function _writeSnapshot(
    mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
    mapping(address => uint256) storage snapshotsCounts,
    address owner,
    uint128 newValue
  ) internal {
    uint128 currentBlock = uint128(block.number);

    uint256 ownerSnapshotsCount = snapshotsCounts[owner];
    mapping(uint256 => Snapshot) storage ownerSnapshots = snapshots[owner];

    if (
      ownerSnapshotsCount != 0 &&
      ownerSnapshots[ownerSnapshotsCount - 1].blockNumber == currentBlock
    ) {
      // Doing multiple operations in the same block
      ownerSnapshots[ownerSnapshotsCount - 1].value = newValue;
    } else {
      ownerSnapshots[ownerSnapshotsCount] = Snapshot(currentBlock, newValue);
      snapshotsCounts[owner] = ownerSnapshotsCount + 1;
    }
  }

  /**
   * @dev Returns the delegatee of a user. If a user never performed any delegation, their
   *  delegated address will be 0x0, in which case we return the user's own address.
   *
   * @param  delegator  The address of the user for which return the delegatee.
   * @param  delegates  The mapping of delegates for a particular type of delegation.
   */
  function _getDelegatee(
    address delegator,
    mapping(address => address) storage delegates
  )
    internal
    view
    returns (address)
  {
    address previousDelegatee = delegates[delegator];

    if (previousDelegatee == address(0)) {
      return delegator;
    }

    return previousDelegatee;
  }
}
