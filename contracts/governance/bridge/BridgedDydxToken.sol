// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import { ERC20 } from '../../dependencies/open-zeppelin/ERC20.sol';
import { SafeERC20 } from '../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { GovernancePowerDelegationERC20Mixin } from '../token/GovernancePowerDelegationERC20Mixin.sol';

/**
 * @title BridgeDydxToken
 * @author dYdX
 *
 * @notice The Bridged dYdX governance token.
 */
contract BridgeDydxToken is
  GovernancePowerDelegationERC20Mixin
{
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Events ============

  /**
   * @dev Emitted when a bridge event occurs.
   *
   * @param  id          Unique, incrementing ID of the bridge event.
   * @param  amount      Amount of tokens bridged.
   * @param  accAddress  Account address of the wallet to send to.
   * @param  data        Any arbitrary data.
   */
  event Bridge(
    uint256 indexed id,
    uint256 amount,
    bytes32 accAddress,
    bytes data
  );

  // ============ Constants ============

  string internal constant NAME = 'Bridged dYdX';
  string internal constant SYMBOL = 'brgDYDX';

  bytes32 public immutable DOMAIN_SEPARATOR;
  bytes public constant EIP712_VERSION = '1';
  bytes32 public constant EIP712_DOMAIN = keccak256(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  );
  bytes32 public constant PERMIT_TYPEHASH = keccak256(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
  );

  IERC20 public immutable DYDX_TOKEN;

  // ============ Storage ============

  /// @dev Mapping from (owner) => (next valid nonce) for EIP-712 signatures.
  mapping(address => uint256) internal _nonces;

  mapping(address => mapping(uint256 => Snapshot)) public _votingSnapshots;
  mapping(address => uint256) public _votingSnapshotsCounts;
  mapping(address => address) public _votingDelegates;

  mapping(address => mapping(uint256 => Snapshot)) public _propositionPowerSnapshots;
  mapping(address => uint256) public _propositionPowerSnapshotsCounts;
  mapping(address => address) public _propositionPowerDelegates;

  /// @notice The next available (unused) id for the bridge event. Equal to the number of events.
  uint256 public _nextAvailableBridgeId;

  // ============ Constructor ============

  /**
   * @notice Constructor.

   * @param  tokenAddress  The address of the token to bridge.
   */
  constructor(
    ERC20 tokenAddress
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

    DYDX_TOKEN = tokenAddress;
  }

  /**
   * @notice Bridge the DYDX token and receive brgDYDX.
   *
   * @param  amount       The amount of tokens to bridge
   * @param  accAddress   The address to send to.
   * @param  memo         Arbitrary memo to include in the event. For possible future compatibility.
   */
  function bridge(
    uint256 amount,
    bytes32 accAddress,
    bytes calldata memo
  )
    external
  {
    // Wrap the tokens.
    DYDX_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, amount);

    // Emit the event and increase the nonce.
    uint256 nonce = _nextAvailableBridgeId;
    emit Bridge(
      nonce,
      amount,
      accAddress,
      memo
    );
    _nextAvailableBridgeId = nonce + 1;
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
