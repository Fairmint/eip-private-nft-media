// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract DemoPrivateMediaNFT is ERC721, Ownable {
    using Strings for address;
    using Strings for uint256;

    uint256 public nextTokenId = 1;
    string private baseTokenUri;

    constructor(string memory initialBaseTokenUri)
        ERC721("SIWE Private Media Demo", "SPMD")
        Ownable(msg.sender)
    {
        baseTokenUri = initialBaseTokenUri;
    }

    function mint() external returns (uint256 tokenId) {
        tokenId = nextTokenId;
        nextTokenId += 1;
        _safeMint(msg.sender, tokenId);
    }

    function setBaseTokenUri(string calldata newBaseTokenUri) external onlyOwner {
        baseTokenUri = newBaseTokenUri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(
            baseTokenUri,
            block.chainid.toString(),
            "/",
            address(this).toHexString(),
            "/",
            tokenId.toString()
        );
    }
}
