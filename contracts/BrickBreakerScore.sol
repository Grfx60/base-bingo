// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BaseBrickBreaker {
    struct PlayerScore {
        uint256 bestScore;
        uint256 bestLevel;
        uint256 updatedAt;
    }

    mapping(address => PlayerScore) public playerScores;

    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 level,
        uint256 timestamp
    );

    function submitScore(uint256 score, uint256 level) external {
        require(score > 0, "Score must be greater than zero");
        require(level > 0, "Level must be greater than zero");

        PlayerScore storage player = playerScores[msg.sender];

        if (score > player.bestScore) {
            player.bestScore = score;
            player.bestLevel = level;
            player.updatedAt = block.timestamp;

            emit ScoreSubmitted(
                msg.sender,
                score,
                level,
                block.timestamp
            );
        }
    }

    function getPlayerScore(
        address player
    )
        external
        view
        returns (
            uint256 bestScore,
            uint256 bestLevel,
            uint256 updatedAt
        )
    {
        PlayerScore memory data = playerScores[player];

        return (
            data.bestScore,
            data.bestLevel,
            data.updatedAt
        );
    }
}