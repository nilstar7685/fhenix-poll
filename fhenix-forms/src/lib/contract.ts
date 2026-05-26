export const FORMS_CONTRACT: `0x${string}` = '0x1796944Ac448714897B113B5FB2cD6D79b6a5B9d'

export const FORMS_ABI = [
  { type: 'function', name: 'createForm', inputs: [
    { name: 'formId', type: 'bytes32' }, { name: 'metadataHash', type: 'bytes32' },
    { name: 'durationBlocks', type: 'uint32' }, { name: 'questionCount', type: 'uint8' },
    { name: 'qTypes', type: 'uint8[]' }, { name: 'slotCounts', type: 'uint8[]' },
    { name: 'labelHashes', type: 'bytes32[]' },
  ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'submitResponse', inputs: [
    { name: 'formId', type: 'bytes32' },
    { name: 'encAnswers', type: 'tuple[]', components: [
      { name: 'ctHash', type: 'uint256' }, { name: 'securityZone', type: 'uint8' },
      { name: 'utype', type: 'uint8' }, { name: 'signature', type: 'bytes' },
    ]},
  ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getForm', inputs: [{ name: 'formId', type: 'bytes32' }], outputs: [{ type: 'tuple', components: [
    { name: 'id', type: 'bytes32' }, { name: 'creator', type: 'address' },
    { name: 'metadataHash', type: 'bytes32' }, { name: 'questionCount', type: 'uint8' },
    { name: 'startBlock', type: 'uint32' }, { name: 'endBlock', type: 'uint32' },
    { name: 'responseCount', type: 'uint32' }, { name: 'revealed', type: 'bool' }, { name: 'exists', type: 'bool' },
  ]}], stateMutability: 'view' },
  { type: 'function', name: 'getQuestion', inputs: [
    { name: 'formId', type: 'bytes32' }, { name: 'questionId', type: 'uint8' },
  ], outputs: [{ type: 'tuple', components: [
    { name: 'questionId', type: 'uint8' }, { name: 'qType', type: 'uint8' },
    { name: 'slotCount', type: 'uint8' }, { name: 'labelHash', type: 'bytes32' }, { name: 'exists', type: 'bool' },
  ]}], stateMutability: 'view' },
  { type: 'function', name: 'getRevealedTally', inputs: [
    { name: 'formId', type: 'bytes32' }, { name: 'questionId', type: 'uint8' }, { name: 'slotId', type: 'uint8' },
  ], outputs: [{ type: 'uint32' }], stateMutability: 'view' },
  { type: 'function', name: 'hasResponded', inputs: [
    { name: 'formId', type: 'bytes32' }, { name: 'addr', type: 'address' },
  ], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'event', name: 'FormCreated', inputs: [
    { name: 'formId', type: 'bytes32', indexed: true },
    { name: 'creator', type: 'address', indexed: true },
    { name: 'endBlock', type: 'uint32', indexed: false },
  ]},
] as const
