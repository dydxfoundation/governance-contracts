// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {
  IGovernancePowerDelegationERC20
} from '../../../interfaces/IGovernancePowerDelegationERC20.sol';
import { SM1Types } from '../lib/SM1Types.sol';
import { SM1ExchangeRate } from './SM1ExchangeRate.sol';
import { SM1Storage } from './SM1Storage.sol';

/**
 * @title SM1GovernancePowerDelegation
 * @author dYdX
 *
 * @dev Provides support for two types of governance powers which are separately delegatable.
 *  Provides functions for delegation and for querying a user's power at a certain block number.
 *
 *  Internally, makes use of staked balances denoted in staked units, but returns underlying token
 *  units from the getPowerAtBlock() and getPowerCurrent() functions.
 *
 *  This is based on, and is designed to match, Aave's implementation, which is used in their
 *  governance token and staked token contracts.
 */
abstract contract SM1GovernancePowerDelegation is
  SM1ExchangeRate,
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

  // ============ External Functions ============

  /**
   * @notice Delegates a specific governance power of the sender to a delegatee.
   *
   * @param  delegatee       The address to delegate power to.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   */
  function delegateByType(
    address delegatee,
    DelegationType delegationType
  )
    external
    override
  {
    _delegateByType(msg.sender, delegatee, delegationType);
  }

  /**
   * @notice Delegates all governance powers of the sender to a delegatee.
   *
   * @param  delegatee  The address to delegate power to.
   */
  function delegate(
    address delegatee
  )
    external
    override
  {
    _delegateByType(msg.sender, delegatee, DelegationType.VOTING_POWER);
    _delegateByType(msg.sender, delegatee, DelegationType.PROPOSITION_POWER);
  }

  /**
   * @dev Delegates specific governance power from signer to `delegatee` using an EIP-712 signature.
   *
   * @param  delegatee       The address to delegate votes to.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   * @param  nonce           The signer's nonce for EIP-712 signatures on this contract.
   * @param  expiry          Expiration timestamp for the signature.
   * @param  v               Signature param.
   * @param  r               Signature param.
   * @param  s               Signature param.
   */
  function delegateByTypeBySig(
    address delegatee,
    DelegationType delegationType,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  )
    external
  {
    bytes32 structHash = keccak256(
      abi.encode(DELEGATE_BY_TYPE_TYPEHASH, delegatee, uint256(delegationType), nonce, expiry)
    );
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _DOMAIN_SEPARATOR_, structHash));
    address signer = ecrecover(digest, v, r, s);
    require(
      signer != address(0),
      'SM1GovernancePowerDelegation: INVALID_SIGNATURE'
    );
    require(
      nonce == _NONCES_[signer]++,
      'SM1GovernancePowerDelegation: INVALID_NONCE'
    );
    require(
      block.timestamp <= expiry,
      'SM1GovernancePowerDelegation: INVALID_EXPIRATION'
    );
    _delegateByType(signer, delegatee, delegationType);
  }

  /**
   * @dev Delegates both governance powers from signer to `delegatee` using an EIP-712 signature.
   *
   * @param  delegatee  The address to delegate votes to.
   * @param  nonce      The signer's nonce for EIP-712 signatures on this contract.
   * @param  expiry     Expiration timestamp for the signature.
   * @param  v          Signature param.
   * @param  r          Signature param.
   * @param  s          Signature param.
   */
  function delegateBySig(
    address delegatee,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  )
    external
  {
    bytes32 structHash = keccak256(abi.encode(DELEGATE_TYPEHASH, delegatee, nonce, expiry));
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _DOMAIN_SEPARATOR_, structHash));
    address signer = ecrecover(digest, v, r, s);
    require(
      signer != address(0),
      'SM1GovernancePowerDelegation: INVALID_SIGNATURE'
    );
    require(
      nonce == _NONCES_[signer]++,
      'SM1GovernancePowerDelegation: INVALID_NONCE'
    );
    require(
      block.timestamp <= expiry,
      'SM1GovernancePowerDelegation: INVALID_EXPIRATION'
    );
    _delegateByType(signer, delegatee, DelegationType.VOTING_POWER);
    _delegateByType(signer, delegatee, DelegationType.PROPOSITION_POWER);
  }

  /**
   * @notice Returns the delegatee of a user.
   *
   * @param  delegator       The address of the delegator.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   */
  function getDelegateeByType(
    address delegator,
    DelegationType delegationType
  )
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
  function getPowerCurrent(
    address user,
    DelegationType delegationType
  )
    external
    override
    view
    returns (uint256)
  {
    return getPowerAtBlock(user, block.number, delegationType);
  }

  /**
   * @notice Get the next valid nonce for EIP-712 signatures.
   *
   *  This nonce should be used when signing for any of the following functions:
   *   - permit()
   *   - delegateByTypeBySig()
   *   - delegateBySig()
   */
  function nonces(
    address owner
  )
    external
    view
    returns (uint256)
  {
    return _NONCES_[owner];
  }

  // ============ Public Functions ============

  function balanceOf(
    address account
  )
    public
    view
    virtual
    returns (uint256);

  /**
   * @notice Returns the power of a user at a certain block, denominated in underlying token units.
   *
   * @param  user            The user whose power to query.
   * @param  blockNumber     The block number at which to get the user's power.
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   *
   * @return The user's governance power of the specified type, in underlying token units.
   */
  function getPowerAtBlock(
    address user,
    uint256 blockNumber,
    DelegationType delegationType
  )
    public
    override
    view
    returns (uint256)
  {
    (
      mapping(address => mapping(uint256 => SM1Types.Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotCounts,
      // unused: delegates
    ) = _getDelegationDataByType(delegationType);

    uint256 stakeAmount = _findValueAtBlock(
      snapshots[user],
      snapshotCounts[user],
      blockNumber,
      0
    );
    uint256 exchangeRate = _findValueAtBlock(
      _EXCHANGE_RATE_SNAPSHOTS_,
      _EXCHANGE_RATE_SNAPSHOT_COUNT_,
      blockNumber,
      EXCHANGE_RATE_BASE
    );
    return underlyingAmountFromStakeAmountWithExchangeRate(stakeAmount, exchangeRate);
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
  )
    internal
  {
    require(
      delegatee != address(0),
      'SM1GovernancePowerDelegation: INVALID_DELEGATEE'
    );

    (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);
    uint256 delegatorBalance = balanceOf(delegator);
    address previousDelegatee = _getDelegatee(delegator, delegates);

    delegates[delegator] = delegatee;

    _moveDelegatesByType(previousDelegatee, delegatee, delegatorBalance, delegationType);
    emit DelegateChanged(delegator, delegatee, delegationType);
  }

  /**
   * @dev Update delegate snapshots whenever staked tokens are transfered, minted, or burned.
   *
   * @param  from          The sender.
   * @param  to            The recipient.
   * @param  stakedAmount  The amount being transfered, denominated in staked units.
   */
  function _moveDelegatesForTransfer(
    address from,
    address to,
    uint256 stakedAmount
  )
    internal
  {
    address votingPowerFromDelegatee = _getDelegatee(from, _VOTING_DELEGATES_);
    address votingPowerToDelegatee = _getDelegatee(to, _VOTING_DELEGATES_);

    _moveDelegatesByType(
      votingPowerFromDelegatee,
      votingPowerToDelegatee,
      stakedAmount,
      DelegationType.VOTING_POWER
    );

    address propositionPowerFromDelegatee = _getDelegatee(from, _PROPOSITION_DELEGATES_);
    address propositionPowerToDelegatee = _getDelegatee(to, _PROPOSITION_DELEGATES_);

    _moveDelegatesByType(
      propositionPowerFromDelegatee,
      propositionPowerToDelegatee,
      stakedAmount,
      DelegationType.PROPOSITION_POWER
    );
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
  )
    internal
  {
    if (from == to) {
      return;
    }

    (
      mapping(address => mapping(uint256 => SM1Types.Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotCounts,
      // unused: delegates
    ) = _getDelegationDataByType(delegationType);

    if (from != address(0)) {
      mapping(uint256 => SM1Types.Snapshot) storage fromSnapshots = snapshots[from];
      uint256 fromSnapshotCount = snapshotCounts[from];
      uint256 previousBalance = 0;

      if (fromSnapshotCount != 0) {
        previousBalance = fromSnapshots[fromSnapshotCount - 1].value;
      }

      uint256 newBalance = previousBalance.sub(amount);
      snapshotCounts[from] = _writeSnapshot(
        fromSnapshots,
        fromSnapshotCount,
        newBalance
      );

      emit DelegatedPowerChanged(from, newBalance, delegationType);
    }

    if (to != address(0)) {
      mapping(uint256 => SM1Types.Snapshot) storage toSnapshots = snapshots[to];
      uint256 toSnapshotCount = snapshotCounts[to];
      uint256 previousBalance = 0;

      if (toSnapshotCount != 0) {
        previousBalance = toSnapshots[toSnapshotCount - 1].value;
      }

      uint256 newBalance = previousBalance.add(amount);
      snapshotCounts[to] = _writeSnapshot(
        toSnapshots,
        toSnapshotCount,
        newBalance
      );

      emit DelegatedPowerChanged(to, newBalance, delegationType);
    }
  }

  /**
   * @dev Returns delegation data (snapshot, snapshotCount, delegates) by delegation type.
   *
   * @param  delegationType  The type of power (VOTING_POWER, PROPOSITION_POWER).
   *
   * @return The mapping of each user to a mapping of snapshots.
   * @return The mapping of each user to the total number of snapshots for that user.
   * @return The mapping of each user to the user's delegate.
   */
  function _getDelegationDataByType(
    DelegationType delegationType
  )
    internal
    view
    returns (
      mapping(address => mapping(uint256 => SM1Types.Snapshot)) storage,
      mapping(address => uint256) storage,
      mapping(address => address) storage
    )
  {
    if (delegationType == DelegationType.VOTING_POWER) {
      return (
        _VOTING_SNAPSHOTS_,
        _VOTING_SNAPSHOT_COUNTS_,
        _VOTING_DELEGATES_
      );
    } else {
      return (
        _PROPOSITION_SNAPSHOTS_,
        _PROPOSITION_SNAPSHOT_COUNTS_,
        _PROPOSITION_DELEGATES_
      );
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
