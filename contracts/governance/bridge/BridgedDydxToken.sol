// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import { ERC20 } from '../../dependencies/open-zeppelin/ERC20.sol';
import { Ownable } from '../../dependencies/open-zeppelin/Ownable.sol';
import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { GovernancePowerDelegationERC20Mixin } from './GovernancePowerDelegationERC20Mixin.sol';

/**
 * @title DydxToken
 * @author dYdX
 *
 * @notice The dYdX governance token.
 */
contract DydxToken is
  GovernancePowerDelegationERC20Mixin,
  Ownable
{
  using SafeMath for uint256;

  // ============ Events ============

  /**
   * @dev Emitted when an address has been added to or removed from the token transfer allowlist.
   *
   * @param  account    Address that was added to or removed from the token transfer allowlist.
   * @param  isAllowed  True if the address was added to the allowlist, false if removed.
   */
  event TransferAllowlistUpdated(address account, bool isAllowed);

  /**
   * @dev Emitted when the transfer restriction timestamp is reassigned.
   *
   * @param  transfersRestrictedBefore  The new timestamp on and after which non-allowlisted transfers may occur.
   */
  event TransfersRestrictedBeforeUpdated(uint256 transfersRestrictedBefore);

  // ============ Constants ============

  string internal constant NAME = 'dYdX';
  string internal constant SYMBOL = 'DYDX';

  uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;

  bytes32 public immutable DOMAIN_SEPARATOR;
  bytes public constant EIP712_VERSION = '1';
  bytes32 public constant EIP712_DOMAIN = keccak256(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  );
  bytes32 public constant PERMIT_TYPEHASH = keccak256(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
  );

  /// @notice Minimum time between mints.
  uint256 public constant MINT_MIN_INTERVAL = 365 days;

  /// @notice Cap on the percentage of the total supply that can be minted at each mint.
  ///  Denominated in percentage points (units out of 100).
  uint256 public immutable MINT_MAX_PERCENT;

  /// @notice The timestamp on and after which the transfer restriction must be lifted.
  uint256 public immutable TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN;

  // ============ Storage ============

  /// @dev Mapping from (owner) => (next valid nonce) for EIP-712 signatures.
  mapping(address => uint256) internal _nonces;

  mapping(address => mapping(uint256 => Snapshot)) public _votingSnapshots;
  mapping(address => uint256) public _votingSnapshotsCounts;
  mapping(address => address) public _votingDelegates;

  mapping(address => mapping(uint256 => Snapshot)) public _propositionPowerSnapshots;
  mapping(address => uint256) public _propositionPowerSnapshotsCounts;
  mapping(address => address) public _propositionPowerDelegates;

  /// @notice Snapshots of the token total supply, at each block where the total supply has changed.
  mapping(uint256 => Snapshot) public _totalSupplySnapshots;

  /// @notice Number of snapshots of the token total supply.
  uint256 public _totalSupplySnapshotsCount;

  /// @notice Allowlist of addresses which may send or receive tokens while transfers are
  ///  otherwise restricted.
  mapping(address => bool) public _tokenTransferAllowlist;

  /// @notice The timestamp on and after which minting may occur.
  uint256 public _mintingRestrictedBefore;

  /// @notice The timestamp on and after which non-allowlisted transfers may occur.
  uint256 public _transfersRestrictedBefore;

  // ============ Constructor ============

  /**
   * @notice Constructor.
   *
   * @param  distributor                           The address which will receive the initial supply of tokens.
   * @param  transfersRestrictedBefore             Timestamp, before which transfers are restricted unless the
   *                                               origin or destination address is in the allowlist.
   * @param  transferRestrictionLiftedNoLaterThan  Timestamp, which is the maximum timestamp that transfer
   *                                               restrictions can be extended to.
   * @param  mintingRestrictedBefore               Timestamp, before which minting is not allowed.
   * @param  mintMaxPercent                        Cap on the percentage of the total supply that can be minted at
   *                                               each mint.
   */
  constructor(
    address distributor,
    uint256 transfersRestrictedBefore,
    uint256 transferRestrictionLiftedNoLaterThan,
    uint256 mintingRestrictedBefore,
    uint256 mintMaxPercent
  )
    ERC20(NAME, SYMBOL)
  {
    uint256 chainId;

    // solium-disable-next-line
    assembly {
      chainId := chainid()
    }

    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
        EIP712_DOMAIN,
        keccak256(bytes(NAME)),
        keccak256(bytes(EIP712_VERSION)),
        chainId,
        address(this)
      )
    );

    // Validate and set parameters.
    require(transfersRestrictedBefore > block.timestamp, 'TRANSFERS_RESTRICTED_BEFORE_TOO_EARLY');
    require(transfersRestrictedBefore <= transferRestrictionLiftedNoLaterThan, 'MAX_TRANSFER_RESTRICTION_TOO_EARLY');
    require(mintingRestrictedBefore > block.timestamp, 'MINTING_RESTRICTED_BEFORE_TOO_EARLY');
    _transfersRestrictedBefore = transfersRestrictedBefore;
    TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN = transferRestrictionLiftedNoLaterThan;
    _mintingRestrictedBefore = mintingRestrictedBefore;
    MINT_MAX_PERCENT = mintMaxPercent;

    // Mint the initial supply.
    _mint(distributor, INITIAL_SUPPLY);

    emit TransfersRestrictedBeforeUpdated(transfersRestrictedBefore);
  }

  // ============ Other Functions ============

  /**
   * @notice Adds addresses to the token transfer allowlist. Reverts if any of the addresses
   *  already exist in the allowlist. Only callable by owner.
   *
   * @param  addressesToAdd  Addresses to add to the token transfer allowlist.
   */
  function addToTokenTransferAllowlist(address[] calldata addressesToAdd)
    external
    onlyOwner
  {
    for (uint256 i = 0; i < addressesToAdd.length; i++) {
      require(
        !_tokenTransferAllowlist[addressesToAdd[i]],
        'ADDRESS_EXISTS_IN_TRANSFER_ALLOWLIST'
      );
      _tokenTransferAllowlist[addressesToAdd[i]] = true;
      emit TransferAllowlistUpdated(addressesToAdd[i], true);
    }
  }

  /**
   * @notice Removes addresses from the token transfer allowlist. Reverts if any of the addresses
   *  don't exist in the allowlist. Only callable by owner.
   *
   * @param  addressesToRemove  Addresses to remove from the token transfer allowlist.
   */
  function removeFromTokenTransferAllowlist(address[] calldata addressesToRemove)
    external
    onlyOwner
  {
    for (uint256 i = 0; i < addressesToRemove.length; i++) {
      require(
        _tokenTransferAllowlist[addressesToRemove[i]],
        'ADDRESS_DOES_NOT_EXIST_IN_TRANSFER_ALLOWLIST'
      );
      _tokenTransferAllowlist[addressesToRemove[i]] = false;
      emit TransferAllowlistUpdated(addressesToRemove[i], false);
    }
  }

  /**
   * @notice Updates the transfer restriction. Reverts if the transfer restriction has already passed,
   *  the new transfer restriction is earlier than the previous one, or the new transfer restriction is
   *  after the maximum transfer restriction.
   *
   * @param  transfersRestrictedBefore  The timestamp on and after which non-allowlisted transfers may occur.
   */
  function updateTransfersRestrictedBefore(uint256 transfersRestrictedBefore)
    external
    onlyOwner
  {
    uint256 previousTransfersRestrictedBefore = _transfersRestrictedBefore;
    require(block.timestamp < previousTransfersRestrictedBefore, 'TRANSFER_RESTRICTION_ENDED');
    require(previousTransfersRestrictedBefore <= transfersRestrictedBefore, 'NEW_TRANSFER_RESTRICTION_TOO_EARLY');
    require(transfersRestrictedBefore <= TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN, 'AFTER_MAX_TRANSFER_RESTRICTION');

    _transfersRestrictedBefore = transfersRestrictedBefore;

    emit TransfersRestrictedBeforeUpdated(transfersRestrictedBefore);
  }

  /**
   * @notice Mint new tokens. Only callable by owner after the required time period has elapsed.
   *
   * @param  recipient  The address to receive minted tokens.
   * @param  amount     The number of tokens to mint.
   */
  function mint(address recipient, uint256 amount)
    external
    onlyOwner
  {
    require(block.timestamp >= _mintingRestrictedBefore, 'MINT_TOO_EARLY');
    require(amount <= totalSupply().mul(MINT_MAX_PERCENT).div(100), 'MAX_MINT_EXCEEDED');

    // Update the next allowed minting time.
    _mintingRestrictedBefore = block.timestamp.add(MINT_MIN_INTERVAL);

    // Mint the amount.
    _mint(recipient, amount);
  }

  /**
   * @notice Implements the permit function as specified in EIP-2612.
   *
   * @param  owner     Address of the token owner.
   * @param  spender   Address of the spender.
   * @param  value     Amount of allowance.
   * @param  deadline  Expiration timestamp for the signature.
   * @param  v         Signature param.
   * @param  r         Signature param.
   * @param  s         Signature param.
   */
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  )
    external
  {
    require(owner != address(0), 'INVALID_OWNER');
    require(block.timestamp <= deadline, 'INVALID_EXPIRATION');
    uint256 currentValidNonce = _nonces[owner];
    bytes32 digest = keccak256(
      abi.encodePacked(
        '\x19\x01',
        DOMAIN_SEPARATOR,
        keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, currentValidNonce, deadline))
      )
    );

    require(owner == ecrecover(digest, v, r, s), 'INVALID_SIGNATURE');
    _nonces[owner] = currentValidNonce.add(1);
    _approve(owner, spender, value);
  }

  /**
   * @notice Get the next valid nonce for EIP-712 signatures.
   *
   *  This nonce should be used when signing for any of the following functions:
   *   - permit()
   *   - delegateByTypeBySig()
   *   - delegateBySig()
   */
  function nonces(address owner)
    external
    view
    returns (uint256)
  {
    return _nonces[owner];
  }

  function transfer(address recipient, uint256 amount)
    public
    override
    returns (bool)
  {
    _requireTransferAllowed(_msgSender(), recipient);
    return super.transfer(recipient, amount);
  }

  function transferFrom(address sender, address recipient, uint256 amount)
    public
    override
    returns (bool)
  {
    _requireTransferAllowed(sender, recipient);
    return super.transferFrom(sender, recipient, amount);
  }

  /**
   * @dev Override _mint() to write a snapshot whenever the total supply changes.
   *
   *  These snapshots are intended to be used by the governance strategy.
   *
   *  Note that the ERC20 _burn() function is never used. If desired, an official burn mechanism
   *  could be implemented external to this contract, and accounted for in the governance strategy.
   */
  function _mint(address account, uint256 amount)
    internal
    override
  {
    super._mint(account, amount);

    uint256 snapshotsCount = _totalSupplySnapshotsCount;
    uint128 currentBlock = uint128(block.number);
    uint128 newValue = uint128(totalSupply());

    // Note: There is no special case for the total supply being updated multiple times in the same
    // block. That should never occur.
    _totalSupplySnapshots[snapshotsCount] = Snapshot(currentBlock, newValue);
    _totalSupplySnapshotsCount = snapshotsCount.add(1);
  }

  function _requireTransferAllowed(address sender, address recipient)
    view
    internal
  {
    // Compare against the constant `TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN` first
    // to avoid additional gas costs from reading from storage.
    if (
      block.timestamp < TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN &&
      block.timestamp < _transfersRestrictedBefore
    ) {
      // While transfers are restricted, a transfer is permitted if either the sender or the
      // recipient is on the allowlist.
      require(
        _tokenTransferAllowlist[sender] || _tokenTransferAllowlist[recipient],
        'NON_ALLOWLIST_TRANSFERS_DISABLED'
      );
    }
  }

  /**
   * @dev Writes a snapshot before any transfer operation, including: _transfer, _mint and _burn.
   *  - On _transfer, it writes snapshots for both 'from' and 'to'.
   *  - On _mint, only for `to`.
   *  - On _burn, only for `from`.
   *
   * @param  from    The sender.
   * @param  to      The recipient.
   * @param  amount  The amount being transfered.
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  )
    internal
    override
  {
    address votingFromDelegatee = _getDelegatee(from, _votingDelegates);
    address votingToDelegatee = _getDelegatee(to, _votingDelegates);

    _moveDelegatesByType(
      votingFromDelegatee,
      votingToDelegatee,
      amount,
      DelegationType.VOTING_POWER
    );

    address propPowerFromDelegatee = _getDelegatee(from, _propositionPowerDelegates);
    address propPowerToDelegatee = _getDelegatee(to, _propositionPowerDelegates);

    _moveDelegatesByType(
      propPowerFromDelegatee,
      propPowerToDelegatee,
      amount,
      DelegationType.PROPOSITION_POWER
    );
  }

  function _getDelegationDataByType(DelegationType delegationType)
    internal
    override
    view
    returns (
      mapping(address => mapping(uint256 => Snapshot)) storage, // snapshots
      mapping(address => uint256) storage, // snapshots count
      mapping(address => address) storage // delegatees list
    )
  {
    if (delegationType == DelegationType.VOTING_POWER) {
      return (_votingSnapshots, _votingSnapshotsCounts, _votingDelegates);
    } else {
      return (
        _propositionPowerSnapshots,
        _propositionPowerSnapshotsCounts,
        _propositionPowerDelegates
      );
    }
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
    public
  {
    bytes32 structHash = keccak256(
      abi.encode(DELEGATE_BY_TYPE_TYPEHASH, delegatee, uint256(delegationType), nonce, expiry)
    );
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', DOMAIN_SEPARATOR, structHash));
    address signer = ecrecover(digest, v, r, s);
    require(signer != address(0), 'INVALID_SIGNATURE');
    require(nonce == _nonces[signer]++, 'INVALID_NONCE');
    require(block.timestamp <= expiry, 'INVALID_EXPIRATION');
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
    public
  {
    bytes32 structHash = keccak256(abi.encode(DELEGATE_TYPEHASH, delegatee, nonce, expiry));
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', DOMAIN_SEPARATOR, structHash));
    address signer = ecrecover(digest, v, r, s);
    require(signer != address(0), 'INVALID_SIGNATURE');
    require(nonce == _nonces[signer]++, 'INVALID_NONCE');
    require(block.timestamp <= expiry, 'INVALID_EXPIRATION');
    _delegateByType(signer, delegatee, DelegationType.VOTING_POWER);
    _delegateByType(signer, delegatee, DelegationType.PROPOSITION_POWER);
  }
}
