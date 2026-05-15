// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint32, InEuint32} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title FhenixPoll
/// @notice Privacy-preserving ranked-choice voting with FHE-encrypted tallies.
///         Wave 3: on-chain hierarchical option tree with per-node tallies.
///         Wave 4: community posts (IPFS content hash) and quests (FHE-encrypted progress).
contract FhenixPoll is EIP712 {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Community {
        bytes32 id;
        address creator;
        bytes32 configHash;
        uint8   credType;    // 0=open, 1=gated, 2=multi-gate
        bool    exists;
    }

    struct Poll {
        bytes32  id;
        bytes32  communityId;
        address  creator;
        uint8    credType;
        uint32   startBlock;
        uint32   endBlock;
        uint8    optionCount;
        bool     tallyRevealed;
        bool     exists;
        uint8    pollType;  // 0=RANKED, 1=HIERARCHICAL, 2=SIMPLE, 3=SURVEY
    }

    /// @dev On-chain option node for hierarchical polls.
    ///      parentId == 0 means root-level option.
    struct PollOption {
        uint8   optionId;
        uint8   parentId;   // 0 = root
        uint8   childCount;
        bytes32 labelHash;  // keccak256(label) — label stored off-chain
        bool    exists;
    }

    struct Credential {
        address  holder;
        bytes32  communityId;
        uint8    credType;
        uint64   votingWeight;
        uint32   issuedAt;
        uint32   expiry;
        bool     exists;
    }

    struct CredentialAttestation {
        address  recipient;
        bytes32  communityId;
        bytes32  nullifier;
        uint8    credType;
        uint64   votingWeight;
        uint32   expiryBlock;
        uint32   issuedAt;
        uint256  nonce;
    }

    // ─── Wave 4: Posts ────────────────────────────────────────────────────────

    struct Post {
        bytes32 id;
        bytes32 communityId;
        address author;
        bytes32 contentHash;  // keccak256(IPFS CID) — content stored off-chain
        uint32  createdAt;    // block number
        bool    exists;
    }

    // ─── Wave 4: Quests ───────────────────────────────────────────────────────

    enum QuestType { VOTE_COUNT, REFERRAL_COUNT, CREDENTIAL_AGE }

    struct Quest {
        bytes32   id;
        bytes32   communityId;
        address   creator;
        QuestType questType;
        uint32    target;       // e.g. vote 5 polls, refer 3 members
        bytes32   rewardHash;   // keccak256(reward metadata IPFS CID)
        uint32    expiryBlock;
        bool      exists;
    }

    // ─── Wave 5: Surveys ─────────────────────────────────────────────────────

    struct SurveyQuestion {
        uint8   questionId;   // 1-based
        uint8   answerCount;  // 2–10
        bytes32 labelHash;    // keccak256(question text)
        bool    exists;
    }

    uint8 public constant MAX_SURVEY_QUESTIONS = 20;

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Community) public communities;
    mapping(bytes32 => Poll)      public polls;

    // Wave 3: pollId => optionId => PollOption
    mapping(bytes32 => mapping(uint8 => PollOption)) public pollOptions;

    // pollId => optionId => encrypted running tally
    mapping(bytes32 => mapping(uint8 => euint32)) private _tallies;

    // pollId => optionId => revealed plaintext tally (leaf only)
    mapping(bytes32 => mapping(uint8 => uint32)) public revealedTallies;

    // pollId => optionId => rolled-up tally (sum of node + all descendants)
    mapping(bytes32 => mapping(uint8 => uint32)) public rolledUpTallies;

    // pollId => optionId => ctHash
    mapping(bytes32 => mapping(uint8 => bytes32)) public tallyCtHashes;

    // Double-vote prevention
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    // Credentials
    mapping(address => mapping(bytes32 => Credential)) public credentials;

    // Anti-sybil & replay
    address public immutable verifierAddress;
    mapping(bytes32 => bool) public usedSocialNullifiers;
    mapping(uint256 => bool) public usedNonces;

    // Wave 4: Posts
    mapping(bytes32 => Post) public posts;
    // communityId => postId[]
    mapping(bytes32 => bytes32[]) private _communityPosts;

    // Wave 4: Quests
    mapping(bytes32 => Quest) public quests;
    // communityId => questId[]
    mapping(bytes32 => bytes32[]) private _communityQuests;

    // questId => address => FHE-encrypted progress (euint32)
    mapping(bytes32 => mapping(address => euint32)) private _questProgress;
    // questId => address => ctHash for progress reveal
    mapping(bytes32 => mapping(address => bytes32)) public questProgressCtHash;
    // questId => address => completed
    mapping(bytes32 => mapping(address => bool)) public questCompleted;

    // Wave 5: Surveys
    mapping(bytes32 => mapping(uint8 => SurveyQuestion)) public surveyQuestions;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => euint32))) private _surveyTallies;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => uint32))) public surveyRevealedTallies;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bytes32))) public surveyCtHashes;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CommunityRegistered(bytes32 indexed id, address indexed creator);
    event PollCreated(bytes32 indexed pollId, bytes32 indexed communityId, uint32 endBlock);
    event VoteCast(bytes32 indexed pollId, address indexed voter);
    event TallyRevealed(bytes32 indexed pollId, uint8 optionCount);
    event TallyPublished(bytes32 indexed pollId, uint8 indexed optionId, uint32 plaintext);
    event CredentialIssued(address indexed recipient, bytes32 indexed communityId, bytes32 nullifier);
    // Wave 4
    event PostCreated(bytes32 indexed postId, bytes32 indexed communityId, address indexed author);
    event QuestCreated(bytes32 indexed questId, bytes32 indexed communityId);
    event QuestProgressUpdated(bytes32 indexed questId, address indexed participant);
    event QuestCompleted(bytes32 indexed questId, address indexed participant);

    // ─── EIP-712 ──────────────────────────────────────────────────────────────

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "CredentialAttestation(address recipient,bytes32 communityId,bytes32 nullifier,"
        "uint8 credType,uint64 votingWeight,uint32 expiryBlock,uint32 issuedAt,uint256 nonce)"
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _verifierAddress) EIP712("FhenixPoll", "1") {
        require(_verifierAddress != address(0), "Zero verifier address");
        verifierAddress = _verifierAddress;
    }

    // ─── Community ────────────────────────────────────────────────────────────

    function registerCommunity(
        bytes32 communityId,
        bytes32 configHash,
        uint8   credType
    ) external {
        require(!communities[communityId].exists, "Community exists");
        communities[communityId] = Community({
            id:         communityId,
            creator:    msg.sender,
            configHash: configHash,
            credType:   credType,
            exists:     true
        });
        emit CommunityRegistered(communityId, msg.sender);
    }

    // ─── Polls ────────────────────────────────────────────────────────────────

    function createPoll(
        bytes32 pollId,
        bytes32 communityId,
        uint8   credType,
        uint32  durationBlocks,
        uint8   optionCount
    ) external {
        _createPoll(pollId, communityId, credType, durationBlocks, optionCount, 0);
    }

    /// @notice Create a hierarchical poll and register the option tree on-chain.
    /// @param parentIds  parentIds[i] = parent optionId for option (i+1); 0 = root.
    ///                   Length must equal optionCount.
    function createHierarchicalPoll(
        bytes32 pollId,
        bytes32 communityId,
        uint8   credType,
        uint32  durationBlocks,
        uint8   optionCount,
        uint8[] calldata parentIds,
        bytes32[] calldata labelHashes
    ) external {
        require(parentIds.length == optionCount, "parentIds length mismatch");
        require(labelHashes.length == optionCount, "labelHashes length mismatch");

        _createPoll(pollId, communityId, credType, durationBlocks, optionCount, 1);

        // Register option tree
        for (uint8 i = 0; i < optionCount; i++) {
            uint8 optId = i + 1; // 1-based
            uint8 pid   = parentIds[i];
            require(pid < optId, "Parent must precede child"); // prevents cycles

            pollOptions[pollId][optId] = PollOption({
                optionId:   optId,
                parentId:   pid,
                childCount: 0,
                labelHash:  labelHashes[i],
                exists:     true
            });

            // Increment parent's childCount
            if (pid != 0) {
                pollOptions[pollId][pid].childCount++;
            }
        }
    }

    function _createPoll(
        bytes32 pollId,
        bytes32 communityId,
        uint8   credType,
        uint32  durationBlocks,
        uint8   optionCount,
        uint8   pollType
    ) internal {
        require(communities[communityId].exists, "Community not found");
        require(communities[communityId].creator == msg.sender, "Not community creator");
        require(!polls[pollId].exists, "Poll exists");
        require(optionCount >= 2 && optionCount <= 32, "Options: 2-32");

        polls[pollId] = Poll({
            id:              pollId,
            communityId:     communityId,
            creator:         msg.sender,
            credType:        credType,
            startBlock:      uint32(block.number),
            endBlock:        uint32(block.number) + durationBlocks,
            optionCount:     optionCount,
            tallyRevealed:   false,
            exists:          true,
            pollType:        pollType
        });
        emit PollCreated(pollId, communityId, uint32(block.number) + durationBlocks);
    }

    /// @notice Create a simple single-choice poll (pick exactly one option).
    function createSimplePoll(
        bytes32 pollId,
        bytes32 communityId,
        uint8   credType,
        uint32  durationBlocks,
        uint8   optionCount
    ) external {
        _createPoll(pollId, communityId, credType, durationBlocks, optionCount, 2);
    }

    /// @notice Create an anonymous survey with multiple questions.
    /// @param questionCount  Number of questions (stored in optionCount field)
    /// @param answerCounts   answerCounts[i] = number of answer options for question i+1
    /// @param labelHashes    keccak256(question text) per question
    function createSurvey(
        bytes32   pollId,
        bytes32   communityId,
        uint8     credType,
        uint32    durationBlocks,
        uint8     questionCount,
        uint8[]   calldata answerCounts,
        bytes32[] calldata labelHashes
    ) external {
        require(questionCount >= 1 && questionCount <= MAX_SURVEY_QUESTIONS, "Questions: 1-20");
        require(answerCounts.length == questionCount, "answerCounts length");
        require(labelHashes.length == questionCount, "labelHashes length");

        _createPoll(pollId, communityId, credType, durationBlocks, questionCount, 3);

        for (uint8 i = 0; i < questionCount; i++) {
            require(answerCounts[i] >= 2 && answerCounts[i] <= 10, "Answers: 2-10");
            surveyQuestions[pollId][i + 1] = SurveyQuestion({
                questionId:  i + 1,
                answerCount: answerCounts[i],
                labelHash:   labelHashes[i],
                exists:      true
            });
        }
    }

    // ─── Voting ───────────────────────────────────────────────────────────────

    /// @notice Cast a simple vote (single choice). Reuses _tallies storage.
    function castSimpleVote(
        bytes32              pollId,
        InEuint32[] calldata weights
    ) external {
        Poll storage poll = polls[pollId];
        require(poll.exists,                        "Poll not found");
        require(poll.pollType == 2,                 "Not a simple poll");
        require(block.number <= poll.endBlock,      "Poll closed");
        require(!hasVoted[pollId][msg.sender],      "Already voted");
        require(weights.length == poll.optionCount, "Wrong option count");

        if (poll.credType != 0) {
            Credential storage cred = credentials[msg.sender][poll.communityId];
            require(cred.exists,                 "No credential");
            require(block.number <= cred.expiry, "Credential expired");
        }

        for (uint8 i = 0; i < poll.optionCount; i++) {
            euint32 encWeight = FHE.asEuint32(weights[i]);
            FHE.allowThis(encWeight);
            if (euint32.unwrap(_tallies[pollId][i]) == 0) {
                _tallies[pollId][i] = encWeight;
            } else {
                _tallies[pollId][i] = FHE.add(_tallies[pollId][i], encWeight);
            }
            FHE.allowThis(_tallies[pollId][i]);
        }

        hasVoted[pollId][msg.sender] = true;
        emit VoteCast(pollId, msg.sender);
    }

    function castVote(
        bytes32              pollId,
        InEuint32[] calldata weights
    ) external {
        Poll storage poll = polls[pollId];
        require(poll.exists,                        "Poll not found");
        require(block.number <= poll.endBlock,      "Poll closed");
        require(!hasVoted[pollId][msg.sender],      "Already voted");
        require(weights.length == poll.optionCount, "Wrong option count");

        if (poll.credType != 0) {
            Credential storage cred = credentials[msg.sender][poll.communityId];
            require(cred.exists,                 "No credential");
            require(block.number <= cred.expiry, "Credential expired");
        }

        for (uint8 i = 0; i < poll.optionCount; i++) {
            euint32 encWeight = FHE.asEuint32(weights[i]);
            FHE.allowThis(encWeight);
            if (euint32.unwrap(_tallies[pollId][i]) == 0) {
                _tallies[pollId][i] = encWeight;
            } else {
                _tallies[pollId][i] = FHE.add(_tallies[pollId][i], encWeight);
            }
            FHE.allowThis(_tallies[pollId][i]);
        }

        hasVoted[pollId][msg.sender] = true;
        emit VoteCast(pollId, msg.sender);
    }

    /// @notice Cast a survey vote. encAnswers is a flat array of encrypted 0/1 values
    ///         for all questions × answers (ordered by question, then answer within question).
    function castSurveyVote(
        bytes32              pollId,
        InEuint32[] calldata encAnswers
    ) external {
        Poll storage poll = polls[pollId];
        require(poll.exists,                   "Poll not found");
        require(poll.pollType == 3,            "Not a survey");
        require(block.number <= poll.endBlock,  "Poll closed");
        require(!hasVoted[pollId][msg.sender],  "Already voted");

        if (poll.credType != 0) {
            Credential storage cred = credentials[msg.sender][poll.communityId];
            require(cred.exists,                 "No credential");
            require(block.number <= cred.expiry, "Credential expired");
        }

        uint16 idx = 0;
        for (uint8 q = 1; q <= poll.optionCount; q++) {
            SurveyQuestion storage sq = surveyQuestions[pollId][q];
            for (uint8 a = 0; a < sq.answerCount; a++) {
                euint32 enc = FHE.asEuint32(encAnswers[idx]);
                FHE.allowThis(enc);
                if (euint32.unwrap(_surveyTallies[pollId][q][a]) == 0) {
                    _surveyTallies[pollId][q][a] = enc;
                } else {
                    _surveyTallies[pollId][q][a] = FHE.add(_surveyTallies[pollId][q][a], enc);
                }
                FHE.allowThis(_surveyTallies[pollId][q][a]);
                idx++;
            }
        }

        hasVoted[pollId][msg.sender] = true;
        emit VoteCast(pollId, msg.sender);
    }

    // ─── Tally Reveal ─────────────────────────────────────────────────────────

    function requestTallyReveal(bytes32 pollId) external {
        Poll storage poll = polls[pollId];
        require(poll.exists,                  "Poll not found");
        require(block.number > poll.endBlock, "Poll still open");
        require(!poll.tallyRevealed,          "Already revealed");

        for (uint8 i = 0; i < poll.optionCount; i++) {
            euint32 tally = _tallies[pollId][i];
            // Skip options that received no votes (zero handle)
            if (euint32.unwrap(tally) == 0) continue;
            tallyCtHashes[pollId][i] = euint32.unwrap(tally);
            FHE.allowPublic(tally);
            // Note: do NOT call FHE.decrypt — that is the old pattern.
            // The tally runner calls decryptForTx off-chain, then publishTallyResult on-chain.
        }
        poll.tallyRevealed = true;
        emit TallyRevealed(pollId, poll.optionCount);
    }

    function publishTallyResult(
        bytes32 pollId,
        uint8   optionId,
        uint32  plaintext,
        bytes calldata signature
    ) external {
        require(polls[pollId].tallyRevealed,          "Reveal not requested");
        require(optionId < polls[pollId].optionCount, "Invalid optionId");
        // Skip options that had no votes (zero handle — never encrypted)
        if (euint32.unwrap(_tallies[pollId][optionId]) == 0) {
            revealedTallies[pollId][optionId] = 0;
            emit TallyPublished(pollId, optionId, 0);
            return;
        }
        FHE.publishDecryptResult(_tallies[pollId][optionId], plaintext, signature);
        revealedTallies[pollId][optionId] = plaintext;

        // Roll up plaintext to all ancestors so rolledUpTallies[pollId][parentId]
        // accumulates the sum of itself + all descendants as results are published.
        // _tallies uses 0-based index; pollOptions uses 1-based optionId.
        if (polls[pollId].pollType == 1) {
            uint8 parentId = pollOptions[pollId][optionId + 1].parentId;
            while (parentId != 0) {
                rolledUpTallies[pollId][parentId] += plaintext;
                parentId = pollOptions[pollId][parentId].parentId;
            }
        }

        emit TallyPublished(pollId, optionId, plaintext);
    }

    // ─── Survey Reveal ────────────────────────────────────────────────────────

    function requestSurveyReveal(bytes32 pollId) external {
        Poll storage poll = polls[pollId];
        require(poll.exists,                  "Poll not found");
        require(poll.pollType == 3,           "Not a survey");
        require(block.number > poll.endBlock, "Poll still open");
        require(!poll.tallyRevealed,          "Already revealed");

        for (uint8 q = 1; q <= poll.optionCount; q++) {
            SurveyQuestion storage sq = surveyQuestions[pollId][q];
            for (uint8 a = 0; a < sq.answerCount; a++) {
                euint32 tally = _surveyTallies[pollId][q][a];
                if (euint32.unwrap(tally) == 0) continue;
                surveyCtHashes[pollId][q][a] = euint32.unwrap(tally);
                FHE.allowPublic(tally);
            }
        }
        poll.tallyRevealed = true;
        emit TallyRevealed(pollId, poll.optionCount);
    }

    function publishSurveyResult(
        bytes32 pollId,
        uint8   questionId,
        uint8   answerId,
        uint32  plaintext,
        bytes calldata signature
    ) external {
        require(polls[pollId].tallyRevealed, "Reveal not requested");
        euint32 tally = _surveyTallies[pollId][questionId][answerId];
        if (euint32.unwrap(tally) == 0) {
            surveyRevealedTallies[pollId][questionId][answerId] = 0;
        } else {
            FHE.publishDecryptResult(tally, plaintext, signature);
            surveyRevealedTallies[pollId][questionId][answerId] = plaintext;
        }
        emit TallyPublished(pollId, questionId, plaintext);
    }

    // ─── Credentials ──────────────────────────────────────────────────────────

    function issueCredential(
        CredentialAttestation calldata attestation,
        bytes calldata signature
    ) external {
        require(attestation.recipient == msg.sender,          "Not your credential");
        require(communities[attestation.communityId].exists,  "Community not found");
        require(!usedSocialNullifiers[attestation.nullifier], "Nullifier already used");
        require(!usedNonces[attestation.nonce],               "Nonce already used");

        bytes32 digest = _hashAttestation(attestation);
        address signer = ECDSA.recover(digest, signature);
        require(signer == verifierAddress, "Invalid verifier signature");

        usedSocialNullifiers[attestation.nullifier] = true;
        usedNonces[attestation.nonce]               = true;

        credentials[attestation.recipient][attestation.communityId] = Credential({
            holder:       attestation.recipient,
            communityId:  attestation.communityId,
            credType:     attestation.credType,
            votingWeight: attestation.votingWeight,
            issuedAt:     attestation.issuedAt,
            expiry:       attestation.expiryBlock,
            exists:       true
        });

        emit CredentialIssued(attestation.recipient, attestation.communityId, attestation.nullifier);
    }

    function _hashAttestation(CredentialAttestation calldata a) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            a.recipient, a.communityId, a.nullifier,
            a.credType, a.votingWeight, a.expiryBlock, a.issuedAt, a.nonce
        )));
    }

    // ─── Wave 4: Posts ────────────────────────────────────────────────────────

    /// @notice Create a community post. Content stored off-chain (IPFS); only hash on-chain.
    /// @param postId      keccak256(communityId + author + nonce)
    /// @param communityId target community
    /// @param contentHash keccak256(IPFS CID string)
    function createPost(
        bytes32 postId,
        bytes32 communityId,
        bytes32 contentHash
    ) external {
        require(communities[communityId].exists, "Community not found");
        require(!posts[postId].exists,           "Post exists");

        // Gated communities require a valid credential to post
        Community storage comm = communities[communityId];
        if (comm.credType != 0) {
            Credential storage cred = credentials[msg.sender][communityId];
            require(cred.exists,                 "No credential");
            require(block.number <= cred.expiry, "Credential expired");
        }

        posts[postId] = Post({
            id:          postId,
            communityId: communityId,
            author:      msg.sender,
            contentHash: contentHash,
            createdAt:   uint32(block.number),
            exists:      true
        });
        _communityPosts[communityId].push(postId);

        emit PostCreated(postId, communityId, msg.sender);
    }

    function getCommunityPostIds(bytes32 communityId) external view returns (bytes32[] memory) {
        return _communityPosts[communityId];
    }

    // ─── Wave 4: Quests ───────────────────────────────────────────────────────

    /// @notice Create a quest for a community. Only community creator.
    function createQuest(
        bytes32   questId,
        bytes32   communityId,
        QuestType questType,
        uint32    target,
        bytes32   rewardHash,
        uint32    expiryBlock
    ) external {
        require(communities[communityId].exists,           "Community not found");
        require(communities[communityId].creator == msg.sender, "Not community creator");
        require(!quests[questId].exists,                   "Quest exists");
        require(target > 0,                                "Target must be > 0");

        quests[questId] = Quest({
            id:          questId,
            communityId: communityId,
            creator:     msg.sender,
            questType:   questType,
            target:      target,
            rewardHash:  rewardHash,
            expiryBlock: expiryBlock,
            exists:      true
        });
        _communityQuests[communityId].push(questId);

        emit QuestCreated(questId, communityId);
    }

    /// @notice Record encrypted quest progress for a participant.
    ///         The verifier backend calls this after confirming off-chain criteria.
    ///         progress is FHE-encrypted so individual progress stays private.
    /// @param encProgress  InEuint32 — encrypted progress increment (e.g. +1 vote)
    function recordQuestProgress(
        bytes32              questId,
        address              participant,
        InEuint32 calldata   encProgress
    ) external {
        require(msg.sender == verifierAddress, "Only verifier");
        Quest storage quest = quests[questId];
        require(quest.exists,                        "Quest not found");
        require(block.number <= quest.expiryBlock,   "Quest expired");
        require(!questCompleted[questId][participant], "Already completed");

        euint32 enc = FHE.asEuint32(encProgress);
        FHE.allowThis(enc);

        if (euint32.unwrap(_questProgress[questId][participant]) == 0) {
            _questProgress[questId][participant] = enc;
        } else {
            _questProgress[questId][participant] = FHE.add(
                _questProgress[questId][participant], enc
            );
            FHE.allowThis(_questProgress[questId][participant]);
        }

        emit QuestProgressUpdated(questId, participant);
    }

    /// @notice Request decryption of a participant's quest progress.
    ///         Anyone can call — decryption is public so completion can be verified.
    function requestProgressReveal(bytes32 questId, address participant) external {
        require(quests[questId].exists, "Quest not found");
        euint32 prog = _questProgress[questId][participant];
        require(euint32.unwrap(prog) != 0, "No progress recorded");

        questProgressCtHash[questId][participant] = euint32.unwrap(prog);
        FHE.allowPublic(prog);
    }

    /// @notice Publish decrypted progress and mark quest complete if target reached.
    function publishProgressResult(
        bytes32        questId,
        address        participant,
        uint32         plaintext,
        bytes calldata signature
    ) external {
        Quest storage quest = quests[questId];
        require(quest.exists, "Quest not found");
        require(!questCompleted[questId][participant], "Already completed");

        FHE.publishDecryptResult(_questProgress[questId][participant], plaintext, signature);

        if (plaintext >= quest.target) {
            questCompleted[questId][participant] = true;
            emit QuestCompleted(questId, participant);
        }
    }

    function getCommunityQuestIds(bytes32 communityId) external view returns (bytes32[] memory) {
        return _communityQuests[communityId];
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getPoll(bytes32 pollId) external view returns (Poll memory) {
        return polls[pollId];
    }

    function getPollOption(bytes32 pollId, uint8 optionId) external view returns (PollOption memory) {
        return pollOptions[pollId][optionId];
    }

    function getCommunity(bytes32 communityId) external view returns (Community memory) {
        return communities[communityId];
    }

    function getRevealedTally(bytes32 pollId, uint8 optionId) external view returns (uint32) {
        return revealedTallies[pollId][optionId];
    }

    function getCredential(address holder, bytes32 communityId) external view returns (Credential memory) {
        return credentials[holder][communityId];
    }

    function getPost(bytes32 postId) external view returns (Post memory) {
        return posts[postId];
    }

    function getQuest(bytes32 questId) external view returns (Quest memory) {
        return quests[questId];
    }

    function getSurveyQuestion(bytes32 pollId, uint8 questionId) external view returns (SurveyQuestion memory) {
        return surveyQuestions[pollId][questionId];
    }

    function getSurveyRevealedTally(bytes32 pollId, uint8 questionId, uint8 answerId) external view returns (uint32) {
        return surveyRevealedTallies[pollId][questionId][answerId];
    }
}
