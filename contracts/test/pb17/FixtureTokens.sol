// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "../../pb15/ICampaignRegistry.sol";

// TEST-ONLY FIXTURES. None of these is a real token or registry, none belongs in a deployment, and no address
// derived from them is configuration. The campaign takes its token address as an explicit constructor input.

/// @notice FIXTURE six-decimal token standing in for USDC in unit tests. Open mint, test use only.
contract FixtureUSDC6 is ERC20 {
    constructor() ERC20("FIXTURE USDC (6 decimals)", "fUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice FIXTURE 18-decimal token: must be rejected as an unsupported decimals value.
contract FixtureToken18 is ERC20 {
    constructor() ERC20("FIXTURE 18-decimals token", "f18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice FIXTURE contract that has code but no `decimals()`.
contract FixtureNoDecimalsToken {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// @notice FIXTURE six-decimal token that keeps 1% of every transferFrom (fee-on-transfer).
contract FixtureFeeToken is ERC20 {
    constructor() ERC20("FIXTURE fee-on-transfer token", "fFEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        uint256 fee = amount / 100;
        _transfer(from, to, amount - fee);
        _burn(from, fee);
        return true;
    }
}

/// @notice FIXTURE six-decimal token whose transferFrom returns false without moving anything.
contract FixtureFalseReturnToken is ERC20 {
    constructor() ERC20("FIXTURE false-return token", "fFALSE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

interface IFixtureHook {
    function beforeTransfer() external;
}

/// @notice FIXTURE six-decimal token that calls back into the sender before moving funds (ERC-777 style hook),
/// used to exercise the campaign's reentrancy guard.
contract FixtureHookToken is ERC20 {
    constructor() ERC20("FIXTURE hook token", "fHOOK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (from.code.length > 0) IFixtureHook(from).beforeTransfer();
        return super.transferFrom(from, to, amount);
    }
}

interface IFixtureFunder {
    function fund(uint256 amount) external;
}

/// @notice FIXTURE contract supplier that tries to re-enter `fund` from the token hook.
contract FixtureReentrantSupplier is IFixtureHook {
    IFixtureFunder public campaign;
    bool public reenter;
    bool public reentrySucceeded;
    bytes public reentryError;

    function setCampaign(address campaign_) external {
        campaign = IFixtureFunder(campaign_);
    }

    function approveToken(address token_, uint256 amount) external {
        ERC20(token_).approve(address(campaign), amount);
    }

    function callFund(uint256 amount, bool doReenter) external {
        reenter = doReenter;
        campaign.fund(amount);
    }

    function beforeTransfer() external {
        if (reenter) {
            reenter = false;
            try campaign.fund(1) {
                reentrySucceeded = true;
            } catch (bytes memory err) {
                reentryError = err;
            }
        }
    }
}

/// @notice FIXTURE registry that serves one policy but can report an inconsistent hash or funding figure.
contract FixtureInconsistentRegistry is ICampaignRegistry {
    PatchBondTypes.Policy private _p;
    bytes32 public reportedHash;
    uint256 public reportedFunding;

    constructor(PatchBondTypes.Policy memory p, bytes32 reportedHash_, uint256 reportedFunding_) {
        _p = p;
        reportedHash = reportedHash_;
        reportedFunding = reportedFunding_;
    }

    function createCampaign(PatchBondTypes.Policy calldata) external pure returns (bytes32) {
        revert("FIXTURE: read-only");
    }

    function registerEligibleDeployment(bytes32, uint256, bytes32, address, bytes32[] calldata) external pure {
        revert("FIXTURE: read-only");
    }

    function campaignExists(bytes32 id) external view returns (bool) {
        return id == _p.campaignId;
    }

    function policyOf(bytes32) external view returns (PatchBondTypes.Policy memory) {
        return _p;
    }

    function policyHashOf(bytes32) external view returns (bytes32) {
        return reportedHash;
    }

    function requiredFundingOf(bytes32) external view returns (uint256) {
        return reportedFunding;
    }

    function isEligible(bytes32, uint256, bytes32, address, bytes32[] calldata) external pure returns (bool) {
        return false;
    }

    function isDeploymentRegistered(bytes32, bytes32) external pure returns (bool) {
        return false;
    }

    function recipientOf(bytes32, bytes32) external pure returns (address) {
        return address(0);
    }

    function registeredCountOf(bytes32) external pure returns (uint256) {
        return 0;
    }
}
