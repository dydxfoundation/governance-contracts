pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {IERC20} from '../../../interfaces/IERC20.sol';
import {IERC20Detailed} from '../../../interfaces/IERC20Detailed.sol';
import {SM1Types} from '../lib/SM1Types.sol';
import {SM1GovernancePowerDelegation} from './SM1GovernancePowerDelegation.sol';
import {SM1StakedBalances} from './SM1StakedBalances.sol';

/**
 * @title SM1ERC20
 * @author dYdX
 *
 * @dev ERC20 interface for staked tokens. Implements governance functionality for the tokens.
 *
 *  Also allows a user with an active stake to transfer their staked tokens to another user,
 *  even if they would otherwise be restricted from withdrawing.
 */
abstract contract SM1ERC20 is
  SM1StakedBalances,
  SM1GovernancePowerDelegation,
  IERC20Detailed
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice EIP-712 typehash for token approval via EIP-2612 permit.
  bytes32 public constant PERMIT_TYPEHASH = keccak256(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
  );

  // ============ External Functions ============

  function name() external pure override returns (string memory) {
    return 'Staked DYDX';
  }

  function symbol() external pure override returns (string memory) {
    return 'stkDYDX';
  }

  function decimals() external pure override returns (uint8) {
    return 18;
  }

  /**
   * @notice Get the total supply of staked balances.
   *
   *  Note that due to the exchange rate, this is different than querying the total balance of
   *  underyling token staked to this contract.
   *
   * @return The sum of all staked balances.
   */
  function totalSupply() external view override returns (uint256) {
    return getTotalActiveBalanceCurrentEpoch() + getTotalInactiveBalanceCurrentEpoch();
  }

  /**
   * @notice Get a user's staked balance.
   *
   *  Note that due to the exchange rate, one unit of staked balance may not be equivalent to one
   *  unit of the underlying token. Also note that a user's staked balance is different from a
   *  user's transferable balance.
   *
   * @param  account  The account to get the balance of.
   *
   * @return The user's staked balance.
   */
  function balanceOf(address account)
    public
    view
    override(SM1GovernancePowerDelegation, IERC20)
    returns (uint256)
  {
    return getActiveBalanceCurrentEpoch(account) + getInactiveBalanceCurrentEpoch(account);
  }

  function transfer(address recipient, uint256 amount)
    external
    override
    nonReentrant
    returns (bool)
  {
    _transfer(msg.sender, recipient, amount);
    return true;
  }

  function allowance(address owner, address spender) external view override returns (uint256) {
    return _ALLOWANCES_[owner][spender];
  }

  function approve(address spender, uint256 amount) external override returns (bool) {
    _approve(msg.sender, spender, amount);
    return true;
  }

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external override nonReentrant returns (bool) {
    _transfer(sender, recipient, amount);
    _approve(
      sender,
      msg.sender,
      _ALLOWANCES_[sender][msg.sender].sub(amount, 'SM1ERC20: transfer amount exceeds allowance')
    );
    return true;
  }

  function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
    _approve(msg.sender, spender, _ALLOWANCES_[msg.sender][spender].add(addedValue));
    return true;
  }

  function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
    _approve(
      msg.sender,
      spender,
      _ALLOWANCES_[msg.sender][spender].sub(
        subtractedValue,
        'SM1ERC20: Decreased allowance below zero'
      )
    );
    return true;
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
    require(owner != address(0), 'SM1ERC20: INVALID_OWNER');
    require(block.timestamp <= deadline, 'SM1ERC20: INVALID_EXPIRATION');
    uint256 currentValidNonce = _NONCES_[owner];
    bytes32 digest = keccak256(
      abi.encodePacked(
        '\x19\x01',
        _DOMAIN_SEPARATOR_,
        keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, currentValidNonce, deadline))
      )
    );
    require(owner == ecrecover(digest, v, r, s), 'SM1ERC20: INVALID_SIGNATURE');
    _NONCES_[owner] = currentValidNonce.add(1);
    _approve(owner, spender, value);
  }

  // ============ Internal Functions ============

  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  )
    internal
  {
    require(sender != address(0), 'SM1ERC20: Transfer from address(0)');
    require(recipient != address(0), 'SM1ERC20: Transfer to address(0)');
    require(
      getTransferableBalance(sender) >= amount,
      'SM1ERC20: Transfer amount exceeds user next epoch active balance'
    );

    // Update staked balances and delegate snapshots.
    _transferCurrentAndNextActiveBalance(sender, recipient, amount);
    _moveDelegatesForTransfer(sender, recipient, amount);

    emit Transfer(sender, recipient, amount);
  }

  function _approve(
    address owner,
    address spender,
    uint256 amount
  ) internal {
    require(owner != address(0), 'SM1ERC20: Approve from address(0)');
    require(spender != address(0), 'SM1ERC20: Approve to address(0)');

    _ALLOWANCES_[owner][spender] = amount;
    emit Approval(owner, spender, amount);
  }
}
