// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeERC20 } from '../../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { IMerkleDistributorV1 } from '../../../interfaces/IMerkleDistributorV1.sol';
import { IStarkPerpetual } from '../../../interfaces/IStarkPerpetual.sol';
import { SP2Exchange } from './SP2Exchange.sol';

/**
 * @title SP2Withdrawals
 * @author dYdX
 *
 * @dev Actions which may be called only by WITHDRAWAL_OPERATOR_ROLE. Allows for withdrawing
 *  funds from the contract to external addresses that were approved by OWNER_ROLE.
 */
abstract contract SP2Withdrawals is
  SP2Exchange
{
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  IMerkleDistributorV1 public immutable MERKLE_DISTRIBUTOR;

  // ============ Events ============

  event ExternalWithdrewToken(
    address recipient,
    uint256 amount
  );

  event ExternalWithdrewOtherToken(
    address token,
    address recipient,
    uint256 amount
  );

  event ExternalWithdrewEther(
    address recipient,
    uint256 amount
  );

  // ============ Constructor ============

  constructor(
    IMerkleDistributorV1 merkleDistributor
  ) {
    MERKLE_DISTRIBUTOR = merkleDistributor;
  }

  // ============ External Functions ============

  /**
   * @notice Claim rewards from the Merkle distributor. They will be held in this contract until
   *  withdrawn by the WITHDRAWAL_OPERATOR_ROLE.
   *
   * @param  cumulativeAmount  The total all-time rewards this contract has earned.
   * @param  merkleProof       The Merkle proof for this contract address and cumulative amount.
   *
   * @return The amount of new reward received.
   */
  function claimRewardsFromMerkleDistributor(
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    nonReentrant
    onlyRole(WITHDRAWAL_OPERATOR_ROLE)
    returns (uint256)
  {
    return MERKLE_DISTRIBUTOR.claimRewards(cumulativeAmount, merkleProof);
  }

  /**
   * @notice Withdraw a token amount in excess of the borrowed balance, or an amount approved by
   *  the GUARDIAN_ROLE.
   *
   *  The contract may hold an excess balance if, for example, additional funds were added by the
   *  contract owner for use with the same exchange account, or if profits were earned from
   *  activity on the exchange.
   *
   * @param  recipient  The recipient to receive tokens. Must be authorized by OWNER_ROLE.
   */
  function externalWithdrawToken(
    address recipient,
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(WITHDRAWAL_OPERATOR_ROLE)
    onlyAllowedRecipient(recipient)
  {
    // If we are approved for the full amount, then skip the borrowed balance check.
    uint256 approvedAmount = _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_;
    if (approvedAmount >= amount) {
      _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_ = approvedAmount.sub(amount);
    } else {
      uint256 owedBalance = getBorrowedAndDebtBalance();
      uint256 tokenBalance = getTokenBalance();
      require(tokenBalance > owedBalance, 'SP2Withdrawals: No withdrawable balance');
      uint256 availableBalance = tokenBalance.sub(owedBalance);
      require(amount <= availableBalance, 'SP2Withdrawals: Amount exceeds withdrawable balance');

      // Always decrease the approval amount.
      _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_ = 0;
    }

    TOKEN.safeTransfer(recipient, amount);
    emit ExternalWithdrewToken(recipient, amount);
  }

  /**
   * @notice Withdraw any ERC20 token balance other than the token used for borrowing.
   *
   * @param  recipient  The recipient to receive tokens. Must be authorized by OWNER_ROLE.
   */
  function externalWithdrawOtherToken(
    address token,
    address recipient,
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(WITHDRAWAL_OPERATOR_ROLE)
    onlyAllowedRecipient(recipient)
  {
    require(
      token != address(TOKEN),
      'SP2Withdrawals: Cannot use this function to withdraw borrowed token'
    );
    IERC20(token).safeTransfer(recipient, amount);
    emit ExternalWithdrewOtherToken(token, recipient, amount);
  }

  /**
   * @notice Withdraw any ether.
   *
   *  Note: The contract is not expected to hold Ether so this is not normally needed.
   *
   * @param  recipient  The recipient to receive Ether. Must be authorized by OWNER_ROLE.
   */
  function externalWithdrawEther(
    address recipient,
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(WITHDRAWAL_OPERATOR_ROLE)
    onlyAllowedRecipient(recipient)
  {
    payable(recipient).transfer(amount);
    emit ExternalWithdrewEther(recipient, amount);
  }
}
