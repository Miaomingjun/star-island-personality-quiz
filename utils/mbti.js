const dimensionKeys = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']
const traitKeys = [
  'empathy', 'logic', 'action', 'social',
  'idealism', 'independence', 'adventure', 'creativity'
]
const scoreKeys = dimensionKeys.concat(traitKeys)

// Tie-breakers use related hidden traits first, then a fixed fallback.
// The fallback is intentionally deterministic: E / S / T / J.
const tieBreakers = {
  EI: { positive: 'E', positiveTraits: ['social'], negativeTraits: ['independence'], fallback: 'E' },
  SN: { positive: 'N', positiveTraits: ['creativity', 'idealism'], negativeTraits: ['action', 'logic'], fallback: 'S' },
  TF: { positive: 'F', positiveTraits: ['empathy', 'idealism'], negativeTraits: ['logic'], fallback: 'T' },
  JP: { positive: 'J', positiveTraits: ['action', 'logic'], negativeTraits: ['adventure', 'creativity'], fallback: 'J' }
}

function createEmptyScores() {
  return scoreKeys.reduce((scores, key) => {
    scores[key] = 0
    return scores
  }, {})
}

function addScores(scores, delta) {
  const nextScores = Object.assign({}, scores)
  Object.keys(delta || {}).forEach((key) => {
    nextScores[key] = (nextScores[key] || 0) + delta[key]
  })
  return nextScores
}

function sumTraits(scores, keys) {
  return keys.reduce((total, key) => total + (Number(scores[key]) || 0), 0)
}

function resolveDimension(scores, left, right, tieKey) {
  const leftScore = Number(scores[left]) || 0
  const rightScore = Number(scores[right]) || 0
  if (leftScore > rightScore) return left
  if (rightScore > leftScore) return right

  const rule = tieBreakers[tieKey]
  const positiveScore = sumTraits(scores, rule.positiveTraits)
  const negativeScore = sumTraits(scores, rule.negativeTraits)
  if (positiveScore > negativeScore) return rule.positive
  if (negativeScore > positiveScore) return rule.positive === left ? right : left
  return rule.fallback
}

function calculateMBTI(scores) {
  const safeScores = scores || {}
  return [
    resolveDimension(safeScores, 'E', 'I', 'EI'),
    resolveDimension(safeScores, 'S', 'N', 'SN'),
    resolveDimension(safeScores, 'T', 'F', 'TF'),
    resolveDimension(safeScores, 'J', 'P', 'JP')
  ].join('')
}

function getTraitMaximums(questions) {
  const maximums = traitKeys.reduce((result, key) => {
    result[key] = 0
    return result
  }, {})

  ;(questions || []).forEach((question) => {
    traitKeys.forEach((trait) => {
      const questionMaximum = (question.options || []).reduce((max, option) => {
        return Math.max(max, Number(option.scores && option.scores[trait]) || 0)
      }, 0)
      maximums[trait] += questionMaximum
    })
  })
  return maximums
}

function normalizeTraits(scores, questions) {
  const safeScores = scores || {}
  const maximums = getTraitMaximums(questions)
  return traitKeys.reduce((traits, trait) => {
    const maximum = maximums[trait]
    const earned = Number(safeScores[trait]) || 0
    traits[trait] = maximum > 0
      ? Math.max(0, Math.min(100, Math.round((earned / maximum) * 100)))
      : 0
    return traits
  }, {})
}

function getDimensionScores(scores) {
  const safeScores = scores || {}
  return dimensionKeys.reduce((result, key) => {
    result[key] = Number(safeScores[key]) || 0
    return result
  }, {})
}

function buildResult(scores, questions) {
  const dimensionScores = getDimensionScores(scores)
  return {
    mbti: calculateMBTI(dimensionScores),
    dimensionScores,
    traits: normalizeTraits(scores, questions)
  }
}

module.exports = {
  dimensionKeys,
  traitKeys,
  scoreKeys,
  createEmptyScores,
  addScores,
  calculateMBTI,
  normalizeTraits,
  buildResult,
  getTraitMaximums
}
