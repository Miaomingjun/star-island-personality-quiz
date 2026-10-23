const { resolveCloudImage, invalidateCloudImage, getLocalFallback, initCloudImages, disposeCloudImages, cloudPageImageError } = require('../../utils/cloud-image')
const traitLabels = {
  empathy: '共情力', logic: '逻辑力', action: '行动力', social: '社交性',
  idealism: '理想主义', independence: '独立性', adventure: '冒险倾向', creativity: '创造力'
}
const traitKeys = Object.keys(traitLabels)
const FALLBACK_IMAGE = '/assets/placeholders/character.png'

function clampTrait(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0
}

Page({
  data: { backgroundSrc: '/assets/placeholders/background.png', hasResult: false, resultMbti: '', bestMatch: {}, traitItems: [], topMatches: [], descriptionParagraphs: [], imageSrc: '', imageFallbackTried: false },

  onLoad() { initCloudImages(this, { backgroundSrc: '/assets/backgrounds/result-bg.png' }); this.loadResult() },
  onShow() { this.posterOpening = false },
  onUnload() { disposeCloudImages(this); this.imageRequestId = (this.imageRequestId || 0) + 1 },
  cloudImageError(event) { cloudPageImageError(this, event) },

  loadResult() {
    const app = typeof getApp === 'function' ? getApp() : null
    const globalResult = app && app.globalData && app.globalData.currentResult
    const storedResult = wx.getStorageSync('mbtiResult')
    const result = globalResult && globalResult.bestMatch ? globalResult : storedResult
    if (!result || !result.bestMatch) { this.setData({ hasResult: false }); return }

    const rawBestMatch = result.bestMatch
    const bestMatch = Object.assign({ name: '未知角色', anime: '星屿纪行', title: '原创角色', subtitle: '等待下一次探索', similarity: 0, tags: [], resultLine: '', description: '', quote: '' }, rawBestMatch, {
      anime: rawBestMatch.anime || '星屿纪行',
      similarity: clampTrait(rawBestMatch.similarity), tags: Array.isArray(rawBestMatch.tags) ? rawBestMatch.tags : []
    })
    const traits = result.traits || {}
    const traitItems = traitKeys.map((key) => ({ key, label: traitLabels[key], value: clampTrait(traits[key]) }))
    const topMatches = (Array.isArray(result.topMatches) ? result.topMatches : []).map((match, index) => ({
      id: match.id || `match_${index}`, name: match.name || '未知角色', anime: match.anime || '星屿纪行', mbti: match.mbti || '----', similarity: clampTrait(match.similarity), rank: index + 1
    }))
    const descriptionParagraphs = typeof bestMatch.description === 'string'
      ? bestMatch.description.match(/[^。！？]+[。！？]?|[。！？]/g) || [] : []
    this.setData({ hasResult: true, resultMbti: result.mbti || bestMatch.mbti || '----', bestMatch, traitItems, topMatches, descriptionParagraphs, imageSrc: getLocalFallback(bestMatch.image), imageFallbackTried: false })
    const requestId = this.imageRequestId = (this.imageRequestId || 0) + 1
    const originalSrc = bestMatch.image || FALLBACK_IMAGE
    resolveCloudImage(originalSrc).then((resolved) => {
      if (requestId !== this.imageRequestId) return
      this.cloudImageSource = resolved.source
      this.setData({ imageSrc: resolved.path, imageFallbackTried: false })
    })
  },

  imageError() {
    invalidateCloudImage(this.data.bestMatch.image)
    this.cloudImageSource = 'local-fallback'
    if (this.data.imageSrc !== FALLBACK_IMAGE) { this.setData({ imageSrc: FALLBACK_IMAGE, imageFallbackTried: true }); return }
    this.setData({ imageSrc: '' })
  },

  retake() { wx.removeStorageSync('mbtiQuizState'); wx.reLaunch({ url: '/pages/index/index' }) },
  openPoster() {
    if (this.posterOpening) return
    this.posterOpening = true
    const fail = (error) => {
      this.posterOpening = false
      console.error('[result] open poster failed')
      wx.showToast({ title: '无法打开海报，请重试', icon: 'none' })
    }
    const pages = getCurrentPages()
    if (pages.length >= 9) {
      wx.redirectTo({ url: '/pages/poster/poster?returnToResult=1', fail })
      return
    }
    wx.navigateTo({ url: '/pages/poster/poster', fail })
  },
  backHome() { wx.reLaunch({ url: '/pages/index/index' }) }
})
