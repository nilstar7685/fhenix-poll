// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint32, InEuint32} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title FhenixForms
/// @notice Encrypted form responses — only aggregate counts revealed, never individual answers.
///         Supports: SINGLE_CHOICE, MULTI_CHOICE, SCALE (1-10), YES_NO, RATING (1-5).
contract FhenixForms {

    enum QuestionType { SINGLE_CHOICE, MULTI_CHOICE, SCALE, YES_NO, RATING }

    struct Form {
        bytes32  id;
        address  creator;
        bytes32  metadataHash;   // keccak256(IPFS CID)
        uint8    questionCount;
        uint32   startBlock;
        uint32   endBlock;
        uint32   responseCount;
        bool     revealed;
        bool     exists;
    }

    struct Question {
        uint8        questionId;  // 1-based
        QuestionType qType;
        uint8        slotCount;   // SINGLE/MULTI: optionCount, SCALE: 10, YES_NO: 2, RATING: 5
        bytes32      labelHash;
        bool         exists;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Form) public forms;
    mapping(bytes32 => mapping(uint8 => Question)) public questions;

    // formId => questionId => slotId => encrypted count
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => euint32))) private _tallies;

    // formId => questionId => slotId => revealed plaintext
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => uint32))) public revealedTallies;

    // formId => questionId => slotId => ctHash for reveal
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bytes32))) public ctHashes;

    // Double-response prevention
    mapping(bytes32 => mapping(address => bool)) public hasResponded;

    uint8 public constant MAX_QUESTIONS = 20;

    // ─── Events ───────────────────────────────────────────────────────────────

    event FormCreated(bytes32 indexed formId, address indexed creator, uint32 endBlock);
    event ResponseSubmitted(bytes32 indexed formId, address indexed respondent);
    event FormRevealed(bytes32 indexed formId);
    event ResultPublished(bytes32 indexed formId, uint8 questionId, uint8 slotId, uint32 plaintext);

    // ─── Create ───────────────────────────────────────────────────────────────

    function createForm(
        bytes32        formId,
        bytes32        metadataHash,
        uint32         durationBlocks,
        uint8          questionCount,
        QuestionType[] calldata qTypes,
        uint8[]        calldata slotCounts,
        bytes32[]      calldata labelHashes
    ) external {
        require(!forms[formId].exists, "Form exists");
        require(questionCount >= 1 && questionCount <= MAX_QUESTIONS, "Questions: 1-20");
        require(qTypes.length == questionCount, "qTypes length");
        require(slotCounts.length == questionCount, "slotCounts length");
        require(labelHashes.length == questionCount, "labelHashes length");

        forms[formId] = Form({
            id:            formId,
            creator:       msg.sender,
            metadataHash:  metadataHash,
            questionCount: questionCount,
            startBlock:    uint32(block.number),
            endBlock:      uint32(block.number) + durationBlocks,
            responseCount: 0,
            revealed:      false,
            exists:        true
        });

        for (uint8 i = 0; i < questionCount; i++) {
            uint8 slots = slotCounts[i];
            if (qTypes[i] == QuestionType.YES_NO) require(slots == 2, "YES_NO: 2 slots");
            else if (qTypes[i] == QuestionType.RATING) require(slots == 5, "RATING: 5 slots");
            else if (qTypes[i] == QuestionType.SCALE) require(slots == 10, "SCALE: 10 slots");
            else require(slots >= 2 && slots <= 10, "Slots: 2-10");

            questions[formId][i + 1] = Question({
                questionId: i + 1,
                qType:      qTypes[i],
                slotCount:  slots,
                labelHash:  labelHashes[i],
                exists:     true
            });
        }

        emit FormCreated(formId, msg.sender, uint32(block.number) + durationBlocks);
    }

    // ─── Submit Response ──────────────────────────────────────────────────────

    /// @notice Submit encrypted form response. encAnswers is flat: for each question,
    ///         one encrypted value per slot (0 or 1 for choice/bool, one-hot for scale/rating).
    function submitResponse(
        bytes32              formId,
        InEuint32[] calldata encAnswers
    ) external {
        Form storage form = forms[formId];
        require(form.exists, "Form not found");
        require(block.number <= form.endBlock, "Form closed");
        require(!hasResponded[formId][msg.sender], "Already responded");

        uint16 idx = 0;
        for (uint8 q = 1; q <= form.questionCount; q++) {
            Question storage qn = questions[formId][q];
            for (uint8 s = 0; s < qn.slotCount; s++) {
                euint32 enc = FHE.asEuint32(encAnswers[idx]);
                FHE.allowThis(enc);
                if (euint32.unwrap(_tallies[formId][q][s]) == 0) {
                    _tallies[formId][q][s] = enc;
                } else {
                    _tallies[formId][q][s] = FHE.add(_tallies[formId][q][s], enc);
                }
                FHE.allowThis(_tallies[formId][q][s]);
                idx++;
            }
        }

        hasResponded[formId][msg.sender] = true;
        form.responseCount++;
        emit ResponseSubmitted(formId, msg.sender);
    }

    // ─── Reveal ───────────────────────────────────────────────────────────────

    function requestFormReveal(bytes32 formId) external {
        Form storage form = forms[formId];
        require(form.exists, "Form not found");
        require(block.number > form.endBlock, "Form still open");
        require(!form.revealed, "Already revealed");

        for (uint8 q = 1; q <= form.questionCount; q++) {
            Question storage qn = questions[formId][q];
            for (uint8 s = 0; s < qn.slotCount; s++) {
                euint32 tally = _tallies[formId][q][s];
                if (euint32.unwrap(tally) == 0) continue;
                ctHashes[formId][q][s] = euint32.unwrap(tally);
                FHE.allowPublic(tally);
            }
        }

        form.revealed = true;
        emit FormRevealed(formId);
    }

    function publishFormResult(
        bytes32        formId,
        uint8          questionId,
        uint8          slotId,
        uint32         plaintext,
        bytes calldata signature
    ) external {
        require(forms[formId].revealed, "Not revealed");
        euint32 tally = _tallies[formId][questionId][slotId];
        if (euint32.unwrap(tally) == 0) {
            revealedTallies[formId][questionId][slotId] = 0;
        } else {
            FHE.publishDecryptResult(tally, plaintext, signature);
            revealedTallies[formId][questionId][slotId] = plaintext;
        }
        emit ResultPublished(formId, questionId, slotId, plaintext);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getForm(bytes32 formId) external view returns (Form memory) {
        return forms[formId];
    }

    function getQuestion(bytes32 formId, uint8 questionId) external view returns (Question memory) {
        return questions[formId][questionId];
    }

    function getRevealedTally(bytes32 formId, uint8 questionId, uint8 slotId) external view returns (uint32) {
        return revealedTallies[formId][questionId][slotId];
    }
}
