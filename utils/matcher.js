const { traitKeys } = require('./mbti')

const MBTI_WEIGHT = 0.6
const TRAIT_WEIGHT = 0.4

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function safeTraitValue(traits, key) {
  const value = Number(traits && traits[key])
  return Number.isFinite(value) ? clamp(value, 0, 100) : 0
}

function calculateMBTISimilarity(userMbti, characterMbti) {
  const user = typeof userMbti === 'string' ? userMbti.trim().toUpperCase() : ''
  const character = typeof characterMbti === 'string' ? characterMbti.trim().toUpperCase() : ''
  if (!user || !character) return 0

  let matchedLetters = 0
  for (let index = 0; index < 4; index += 1) {
    if (user[index] && user[index] === character[index]) matchedLetters += 1
  }
  return clamp((matchedLetters / 4) * 100, 0, 100)
}

function calculateTraitSimilarity(userTraits, characterTraits) {
  const differences = traitKeys.map((key) => {
    return Math.abs(safeTraitValue(userTraits, key) - safeTraitValue(characterTraits, key))
  })
  const averageDifference = differences.length
    ? differences.reduce((total, difference) => total + difference, 0) / differences.length
    : 100
  return clamp(100 - averageDifference, 0, 100)
}

function compareMatches(a, b) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  if (b.mbtiSimilarity !== a.mbtiSimilarity) return b.mbtiSimilarity - a.mbtiSimilarity
  if (b.traitSimilarity !== a.traitSimilarity) return b.traitSimilarity - a.traitSimilarity

  const aId = String(a.id || '')
  const bId = String(b.id || '')
  if (aId < bId) return -1
  if (aId > bId) return 1
  return 0
}

function matchCharacters(result, characters) {
  if (!Array.isArray(characters) || characters.length === 0) {
    return { bestMatch: null, topMatches: [] }
  }

  const safeResult = result || {}
  const matches = characters
    .filter((character) => character && typeof character === 'object')
    .map((character) => {
      const mbtiSimilarity = calculateMBTISimilarity(safeResult.mbti, character.mbti)
      const traitSimilarity = calculateTraitSimilarity(safeResult.traits, character.traits)
      const totalScore = (mbtiSimilarity * MBTI_WEIGHT) + (traitSimilarity * TRAIT_WEIGHT)
      return Object.assign({}, character, {
        mbtiSimilarity,
        traitSimilarity,
        totalScore,
        similarity: Math.round(totalScore)
      })
    })
    .sort(compareMatches)

  return {
    bestMatch: matches[0] || null,
    topMatches: matches.slice(0, 3)
  }
}

module.exports = {
  MBTI_WEIGHT,
  TRAIT_WEIGHT,
  calculateMBTISimilarity,
  calculateTraitSimilarity,
  matchCharacters
}
