const { resolveCloudImage, invalidateCloudImage, getLocalFallback, initCloudImages, disposeCloudImages, cloudPageImageError, getCloudImageVersion, CLOUD_IMAGE_CACHE_MAX_AGE_MS } = require('../../utils/cloud-image')
const TRAIT_LABELS = {
  empathy: '共情力', logic: '逻辑力', action: '行动力', social: '社交性',
  idealism: '理想主义', independence: '独立性', adventure: '冒险倾向', creativity: '创造力'
}
const TRAIT_KEYS = Object.keys(TRAIT_LABELS)
const TRAIT_KEYWORDS = {
  empathy: '共情', logic: '洞察', action: '行动', social: '热烈',
  idealism: '理想', independence: '自由', adventure: '冒险', creativity: '创造'
}
const DESIGN_W = 750
const DESIGN_H = 1640
const DESIGN_CX = 375
const DESIGN_SAFE_LEFT = 60
const DESIGN_SAFE_RIGHT = 690
const DESIGN_SAFE_WIDTH = 630
const DEBUG_LAYOUT = false
// Two 6s cloud requests + up to four 5s Canvas image loads + 5s export,
// with 8s headroom. Keep the guard after all bounded fallback work.
const POSTER_TOTAL_TIMEOUT_MS = 45000
const BACKGROUND = '/assets/backgrounds/result-bg.png'
const FALLBACK_CHARACTER = '/assets/placeholders/character.png'
let posterPreviewCache = null
let generationSequence = 0

function normalizeResult(result) {
  if (!result || typeof result !== 'object' || !result.bestMatch) return null
  const match = typeof result.bestMatch === 'object' ? result.bestMatch : {}
  const text = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback
  return Object.assign({}, result, {
    bestMatch: Object.assign({}, match, {
      image: text(match.image, FALLBACK_CHARACTER),
      name: text(match.name, '未知角色'),
      anime: text(match.anime, '星屿纪行'),
      title: text(match.title, '原创人格'),
      tags: Array.isArray(match.tags) ? match.tags.filter(item => typeof item === 'string') : []
    }),
    traits: result.traits && typeof result.traits === 'object' ? Object.assign({}, result.traits) : {}
  })
}

function resultCacheKey(result) {
  return JSON.stringify([result.mbti, result.bestMatch, result.traits,
    getCloudImageVersion(result.bestMatch.image || FALLBACK_CHARACTER), getCloudImageVersion(BACKGROUND)])
}

function clamp(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0
}

function readResult() {
  const app = typeof getApp === 'function' ? getApp() : null
  const globalResult = app && app.globalData && app.globalData.currentResult
  if (globalResult && globalResult.bestMatch) return globalResult
  const storedResult = wx.getStorageSync('mbtiResult')
  return storedResult && storedResult.bestMatch ? storedResult : null
}

function errorText(error) {
  if (!error) return 'unknown error'
  if (error.message) return error.message
  if (error.errMsg) return error.errMsg
  try { return JSON.stringify(error) } catch (jsonError) { return String(error) }
}

Page({
  data: { backgroundSrc: '/assets/placeholders/background.png', hasResult: false, resultChecked: false, isDrawing: false, isReady: false, posterPath: '', previewPath: '', previewVisible: false, previewMode: 'aspectFill', previewViewportStyle: '', errorMessage: '', posterStage: 'idle', errorDetail: '' },

  onLoad(options) {
    initCloudImages(this, { backgroundSrc: BACKGROUND })
    this.updatePreviewLayout()
    this.disposed = false
    this.pageReady = false
    this.generationRunning = false
    this.generationCount = 0
    this.returnToResult = String((options && options.returnToResult) || '') === '1'

    // Release builds never enter the development-only Canvas test route.
    this.canvasTest = false
    try {
      this.result = normalizeResult(readResult())
    } catch (error) {
      console.error('[poster] result read failed')
      this.result = null
    }
    if (!this.result && !this.canvasTest) {

      this.setData({ hasResult: false, resultChecked: true })
      return
    }
    this.cacheKey = this.result ? resultCacheKey(this.result) : ''
    const cachedPath = !this.canvasTest && posterPreviewCache && posterPreviewCache.key === this.cacheKey
      && Date.now() - posterPreviewCache.createdAt < CLOUD_IMAGE_CACHE_MAX_AGE_MS
      ? posterPreviewCache.path : ''
    this.reusedPreviewCache = !!cachedPath
    this.setData({ hasResult: true, resultChecked: true, isDrawing: !cachedPath, isReady: !!cachedPath,
      posterPath: cachedPath, previewPath: cachedPath, previewVisible: false,
      errorMessage: '', errorDetail: '', posterStage: cachedPath ? 'done' : 'idle' })
    if (cachedPath) {

      return
    }
    this.needsGeneration = true
  },

  onReady() {
    this.pageReady = true
    this.startPendingGeneration()
  },

  onShow() {
    if (this.result && this.cacheKey !== resultCacheKey(this.result)) this.restartForResourceVersion()
  },

  restartForResourceVersion() {
    if (this.disposed || !this.result) return
    if (this.generationTimer) clearTimeout(this.generationTimer)
    this.activeGenerationId = ++generationSequence
    this.finished = true
    this.generationRunning = false
    this.cacheKey = resultCacheKey(this.result)
    this.reusedPreviewCache = false
    posterPreviewCache = null
    this.needsGeneration = true
    this.setData({ isDrawing: true, isReady: false, previewVisible: false, posterPath: '', previewPath: '', errorMessage: '' }, () => this.startPendingGeneration())
  },

  onResize(event) {
    if (!this.disposed) this.updatePreviewLayout(event && event.size)
  },

  updatePreviewLayout(size) {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const width = Number(size && size.windowWidth) || Number(info.windowWidth) || 375
    const height = Number(size && size.windowHeight) || Number(info.windowHeight) || 667
    const isShortScreen = height / width < 2.1
    const safeTop = Math.max(Number(info.statusBarHeight) || 0, Number(info.safeArea && info.safeArea.top) || 0)
    // The short-screen viewport ends above the existing 76rpx buttons,
    // 40rpx bottom offset, safe-area inset and an additional 16rpx gap.
    this.setData({
      previewMode: isShortScreen ? 'aspectFit' : 'aspectFill',
      previewViewportStyle: isShortScreen
        ? `top: ${Math.ceil(safeTop + width / 750 * 8)}px; bottom: calc(132rpx + env(safe-area-inset-bottom));`
        : ''
    })
  },

  startPendingGeneration() {
    if (this.disposed || !this.pageReady || !this.needsGeneration || this.generationRunning) return
    this.needsGeneration = false
    this.generatePoster()
  },

  onUnload() {
    disposeCloudImages(this)
    this.disposed = true
    this.activeGenerationId = ++generationSequence
    this.finished = true
    this.generationRunning = false
    this.needsGeneration = false
    if (this.generationTimer) clearTimeout(this.generationTimer)
  },

  isCurrentGeneration(id) {
    if (this.disposed || id !== this.activeGenerationId || this.finished) return false
    if (this.cacheKey !== resultCacheKey(this.result)) { this.restartForResourceVersion(); return false }
    return true
  },

  beginGeneration() {
    if (this.disposed || !this.pageReady || this.generationRunning) return null
    const id = ++generationSequence
    this.activeGenerationId = id
    this.cacheKey = resultCacheKey(this.result)
    this.generationRunning = true
    this.generationCount += 1
    this.startGuard(id)

    return id
  },

  startGuard(id) {
    if (this.generationTimer) clearTimeout(this.generationTimer)
    this.finished = false
    this.generationTimer = setTimeout(() => {
      if (!this.isCurrentGeneration(id)) return
      console.error(`[poster] generation timeout after ${POSTER_TOTAL_TIMEOUT_MS}ms`)
      this.finish(false, '海报生成超时，请重新生成。', '', `stage=${this.data.posterStage}`, id)
    }, POSTER_TOTAL_TIMEOUT_MS)
  },

  setStage(stage) {
    if (this.disposed) return
    this.setData({ posterStage: stage })

  },

  finish(success, message, path, detail, id = this.activeGenerationId) {
    if (!this.isCurrentGeneration(id)) return
    this.finished = true
    this.generationRunning = false
    if (this.generationTimer) clearTimeout(this.generationTimer)
    this.generationTimer = null
    try { wx.hideLoading() } catch (error) { console.error('[poster] hideLoading failed') }
    if (success) {

      if (!this.canvasTest && this.cloudImageSource === 'cloud' && this.cloudBackgroundSource === 'cloud') {
        posterPreviewCache = { key: this.cacheKey, path, createdAt: Date.now() }
      }
      this.setData({ isDrawing: false, isReady: true, errorMessage: '', errorDetail: '', posterStage: 'done', posterPath: path, previewPath: path, previewVisible: false })
    } else {
      console.error('[poster] generation stopped')
      this.setData({ isDrawing: false, isReady: false, errorMessage: message || '海报生成失败，请重新生成。', errorDetail: '' })
    }
  },

  getCanvas2d(id = this.activeGenerationId) {
    return new Promise((resolve, reject) => {
      try {
        this.createSelectorQuery().select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
          if (!this.isCurrentGeneration(id)) { reject(new Error('poster generation cancelled')); return }
          const item = res && res[0]
          if (!item || !item.node) {
            const error = new Error('posterCanvas 2d node not found')
            console.error('[poster] canvas node failed')
            reject(error)
            return
          }
          try {
            const canvas = item.node
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('canvas.getContext(2d) returned empty context')
            const cssWidth = Number(item.width)
            const cssHeight = Number(item.height)
            if (!(cssWidth > 0) || !(cssHeight > 0)) {
              throw new Error(`invalid canvas CSS size: ${cssWidth}x${cssHeight}`)
            }
            const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {}
            const dpr = Math.max(1, Math.min(3, Number(systemInfo.pixelRatio) || 1))
            const designScale = cssWidth / DESIGN_W
            const heightScale = cssHeight / DESIGN_H
            if (Math.abs(designScale - heightScale) > 0.01) {
              throw new Error(`canvas CSS ratio must match poster design: ${cssWidth}x${cssHeight}`)
            }
            this.canvas = canvas
            this.ctx = ctx
            this.dpr = dpr
            this.cssWidth = cssWidth
            this.cssHeight = cssHeight
            this.designScale = designScale
            resolve({ canvas, ctx, dpr })
          } catch (error) {
            console.error('[poster] canvas 2d init failed')
            reject(error)
          }
        })
      } catch (error) {
        console.error('[poster] selector query failed')
        reject(error)
      }
    })
  },

  resetCanvasForDraw() {
    const canvas = this.canvas
    if (!canvas) throw new Error('posterCanvas 2d node is unavailable for reset')
    // 重新设置 backing store 会清掉全部旧像素，并重置 transform、clip 和绘图状态。
    canvas.width = Math.round(this.cssWidth * this.dpr)
    canvas.height = Math.round(this.cssHeight * this.dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas.getContext(2d) returned empty context after reset')
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(this.dpr, this.dpr)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    this.ctx = ctx

  },

  loadCanvasImage(src, label) {
    return new Promise((resolve, reject) => {
      const generationId = this.activeGenerationId
      if (!src) {
        const error = new Error(`${label} source is empty`)
        console.error(`[poster] ${label} failed`)
        reject(error)
        return
      }
      try {
        // Canvas 2D 必须使用当前节点创建的 Image，不能把路径字符串直接交给 drawImage。
        const image = this.canvas.createImage()
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          const error = new Error(`${label} canvas image timeout: ${src}`)
          console.error(`[poster] ${label} failed`)
          reject(error)
        }, 5000)
        image.onload = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (!this.isCurrentGeneration(generationId)) { reject(new Error('poster generation cancelled')); return }

          resolve({ image, width: image.width, height: image.height })
        }
        image.onerror = (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          console.error(`[poster] ${label} failed`)
          reject(error || new Error(`${label} canvas image failed: ${src}`))
        }
        image.src = src
      } catch (error) {
        console.error(`[poster] ${label} failed`)
        reject(error)
      }
    })
  },

  async generatePoster() {
    const generationId = this.beginGeneration()
    if (generationId === null) return
    this.reusedPreviewCache = false
    const isCurrent = () => this.isCurrentGeneration(generationId)
    try {
      this.setStage('result-loaded')

      await this.getCanvas2d(generationId)
      if (!isCurrent()) return
      this.resetCanvasForDraw()
      this.setStage('canvas-ready')
      const bestMatch = this.result.bestMatch || {}
      this.setStage('background-loading')

      const resolvedBackground = await resolveCloudImage(BACKGROUND)
      if (!isCurrent()) return
      this.cloudBackgroundSource = resolvedBackground.source
      let background
      try {
        background = await this.loadCanvasImage(resolvedBackground.path, 'background')
      } catch (error) {
        if (!isCurrent()) return
        if (resolvedBackground.source !== 'cloud') throw error
        invalidateCloudImage(BACKGROUND)
        this.cloudBackgroundSource = 'local-fallback'
        background = await this.loadCanvasImage(getLocalFallback(BACKGROUND), 'background fallback')
      }
      if (!isCurrent()) return

      this.drawBackground(background)
      this.setStage('background-drawn')

      let character = null
      try {
        this.setStage('character-loading')

        const originalSrc = bestMatch.image || FALLBACK_CHARACTER
        const resolved = await resolveCloudImage(originalSrc)
        if (!isCurrent()) return
        this.cloudImageSource = resolved.source
        try {
          character = await this.loadCanvasImage(resolved.path, 'character')
        } catch (error) {
          if (!isCurrent()) return
          if (resolved.source !== 'cloud') throw error
          invalidateCloudImage(originalSrc)
          this.cloudImageSource = 'local-fallback'
          character = await this.loadCanvasImage(getLocalFallback(originalSrc), 'local character fallback')
        }
        if (!isCurrent()) return
      } catch (error) {
        if (!isCurrent()) return
        console.error('[poster] character failed')
        try {
          character = await this.loadCanvasImage(FALLBACK_CHARACTER, 'fallback character')
          if (!isCurrent()) return
        } catch (fallbackError) {
          if (!isCurrent()) return
          console.error('[poster] fallback character failed')
        }
      }
      if (character) {
        this.drawCharacter(character)
        this.setStage('character-drawn')

      }

      if (DEBUG_LAYOUT) {

        this.drawDebugLayout()
      } else {
        this.drawTopIdentity(this.result, bestMatch)

        this.drawIdentity(bestMatch)

        this.drawTags(bestMatch)

        this.drawResultLine(bestMatch)

        this.drawTraits(this.result.traits || {})
        this.setStage('text-drawn')

        this.drawBrandFooter()
      }
      this.setStage('exporting')
      const path = await this.exportCanvas('full')
      if (!isCurrent()) return

      this.finish(true, '', path, '', generationId)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[poster] generate failed')
      this.finish(false, '海报生成失败，请重新生成。', '', errorText(error), generationId)
    }
  },

  async drawMinimalTest() {
    const generationId = this.activeGenerationId

    const ctx = this.ctx
    const width = this.cssWidth
    const height = this.cssHeight
    ctx.fillStyle = '#5d4ac7'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${this.S(64)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('POSTER TEST', width / 2, height / 2)

    const path = await this.exportCanvas('minimal')
    if (!this.isCurrentGeneration(generationId)) return

    this.finish(true, '', path, '', generationId)
  },

  async runCanvasTest() {
    const generationId = this.beginGeneration()
    if (generationId === null) return
    try {
      wx.showLoading({ title: 'Canvas 测试中', mask: true })
      this.setStage('canvas-test')

      await this.getCanvas2d(generationId)
      if (!this.isCurrentGeneration(generationId)) return
      this.resetCanvasForDraw()
      await this.drawMinimalTest()
    } catch (error) {
      if (!this.isCurrentGeneration(generationId)) return
      console.error('[poster] canvas test failed')
      this.finish(false, 'Canvas 最小测试失败，请重新生成。', '', errorText(error), generationId)
    }
  },

  exportCanvas(label) {
    return new Promise((resolve, reject) => {
      if (!this.canvas) {
        const error = new Error('canvas 2d node is unavailable')
        console.error('[poster] export failed')
        reject(error)
        return
      }

      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        const error = new Error(`${label} canvas export timeout`)
        console.error('[poster] export failed')
        reject(error)
      }, 5000)
      try {
        const backingWidth = Number(this.canvas.width) || Math.round(this.cssWidth * this.dpr)
        const backingHeight = Number(this.canvas.height) || Math.round(this.cssHeight * this.dpr)
        const outputWidth = DESIGN_W
        const outputHeight = DESIGN_H

        wx.canvasToTempFilePath({
          canvas: this.canvas,
          x: 0,
          y: 0,
          width: this.cssWidth,
          height: this.cssHeight,
          destWidth: outputWidth,
          destHeight: outputHeight,
          fileType: 'png',
          quality: 1,
          success: (res) => {
            if (settled) return
            settled = true
            clearTimeout(timer)

            resolve(res.tempFilePath)
          },
          fail: (error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            console.error('[poster] export failed')
            reject(error || new Error(`${label} canvas export failed`))
          },
          complete: (result) => undefined
        }, this)
      } catch (error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        console.error('[poster] export threw')
        reject(error)
      }
    })
  },

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
  },

  drawBackground(background) {
    const scale = Math.max(this.cssWidth / background.width, this.cssHeight / background.height)
    const width = background.width * scale
    const height = background.height * scale
    const drawX = (this.cssWidth - width) / 2
    const drawY = (this.cssHeight - height) / 2

    const ctx = this.ctx
    ctx.save()
    this.clearCanvas()
    ctx.drawImage(background.image, drawX, drawY, width, height)
    ctx.fillStyle = 'rgba(15, 12, 48, 0.38)'
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
    const vertical = ctx.createLinearGradient(0, 0, 0, this.cssHeight)
    vertical.addColorStop(0, 'rgba(12, 11, 53, 0.68)')
    vertical.addColorStop(0.28, 'rgba(19, 14, 65, 0.12)')
    vertical.addColorStop(0.53, 'rgba(18, 12, 54, 0.20)')
    vertical.addColorStop(0.73, 'rgba(17, 12, 55, 0.78)')
    vertical.addColorStop(1, 'rgba(10, 8, 39, 0.86)')
    ctx.fillStyle = vertical
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
    const leftEdge = ctx.createLinearGradient(0, 0, this.X(170), 0)
    leftEdge.addColorStop(0, 'rgba(10, 7, 40, 0.66)')
    leftEdge.addColorStop(1, 'rgba(10, 7, 40, 0)')
    ctx.fillStyle = leftEdge
    ctx.fillRect(0, 0, this.X(170), this.cssHeight)
    const rightEdge = ctx.createLinearGradient(this.X(580), 0, this.cssWidth, 0)
    rightEdge.addColorStop(0, 'rgba(10, 7, 40, 0)')
    rightEdge.addColorStop(1, 'rgba(10, 7, 40, 0.66)')
    ctx.fillStyle = rightEdge
    ctx.fillRect(this.X(580), 0, this.X(170), this.cssHeight)
    const spotlight = ctx.createRadialGradient(this.X(375), this.Y(615), this.S(40), this.X(375), this.Y(615), this.S(420))
    spotlight.addColorStop(0, 'rgba(255, 222, 252, 0.24)')
    spotlight.addColorStop(0.55, 'rgba(157, 137, 255, 0.10)')
    spotlight.addColorStop(1, 'rgba(157, 137, 255, 0)')
    ctx.fillStyle = spotlight
    ctx.fillRect(this.X(10), this.Y(250), this.X(730), this.Y(850))
    ctx.restore()
  },

  drawCharacter(character) {
    // 同一个 aspectFit 主视觉框适配全部角色；不按角色裁切或平移。
    const ctx = this.ctx
    const halo = ctx.createRadialGradient(this.X(375), this.Y(660), this.S(35), this.X(375), this.Y(660), this.S(430))
    halo.addColorStop(0, 'rgba(255, 225, 248, 0.42)')
    halo.addColorStop(0.6, 'rgba(180, 153, 255, 0.18)')
    halo.addColorStop(1, 'rgba(176, 146, 255, 0)')
    ctx.save()
    ctx.fillStyle = halo
    ctx.fillRect(this.X(10), this.Y(310), this.X(730), this.Y(750))
    ctx.restore()
    const x = this.X(24); const y = this.Y(350); const width = this.X(702); const height = this.Y(675)
    const scale = Math.min(width / character.width, height / character.height)
    const drawWidth = character.width * scale; const drawHeight = character.height * scale
    const drawX = x + (width - drawWidth) / 2
    const drawY = y + (height - drawHeight) / 2

    ctx.save()
    ctx.shadowColor = 'rgba(207, 169, 255, 0.45)'
    ctx.shadowBlur = this.S(44)
    ctx.drawImage(character.image, drawX, drawY, drawWidth, drawHeight)
    ctx.shadowBlur = 0
    const feather = Math.min(this.X(100), drawWidth / 4)
    const edgeColor = 'rgba(18, 13, 58, 0.78)'
    const leftBlend = ctx.createLinearGradient(drawX, 0, drawX + feather, 0)
    leftBlend.addColorStop(0, edgeColor)
    leftBlend.addColorStop(1, 'rgba(18, 13, 58, 0)')
    ctx.fillStyle = leftBlend
    ctx.fillRect(drawX, drawY, feather, drawHeight)
    const rightBlend = ctx.createLinearGradient(drawX + drawWidth - feather, 0, drawX + drawWidth, 0)
    rightBlend.addColorStop(0, 'rgba(18, 13, 58, 0)')
    rightBlend.addColorStop(1, edgeColor)
    ctx.fillStyle = rightBlend
    ctx.fillRect(drawX + drawWidth - feather, drawY, feather, drawHeight)
    const softTop = ctx.createLinearGradient(0, drawY, 0, drawY + this.Y(90))
    softTop.addColorStop(0, 'rgba(17, 12, 57, 0.82)')
    softTop.addColorStop(1, 'rgba(17, 12, 57, 0)')
    ctx.fillStyle = softTop
    ctx.fillRect(drawX, drawY, drawWidth, this.Y(90))
    const softBottom = ctx.createLinearGradient(0, this.Y(775), 0, this.Y(1055))
    softBottom.addColorStop(0, 'rgba(17, 12, 57, 0)')
    softBottom.addColorStop(1, 'rgba(15, 10, 50, 0.78)')
    ctx.fillStyle = softBottom
    ctx.fillRect(0, this.Y(775), this.cssWidth, this.Y(280))
    ctx.restore()
  },

  wrapText(text, maxWidth, fontSize) {
    this.ctx.font = `${fontSize}px sans-serif`
    const lines = []; let line = ''
    Array.from(String(text || '')).forEach((char) => {
      const next = line + char
      const closing = /[，。！？、；：”’）】]/.test(char)
      if (line && this.ctx.measureText(next).width > maxWidth) {
        if (closing) { lines.push(next); line = '' }
        else { lines.push(line); line = char }
      } else if (!line && closing && lines.length) {
        lines[lines.length - 1] += char
      } else line = next
    })
    if (line) lines.push(line)
    return lines
  },

  drawLines(text, x, y, maxWidth, lineHeight, fontSize, maxLines, align = 'center') {
    const ctx = this.ctx
    ctx.save()
    const actualX = this.X(x)
    const actualY = this.Y(y)
    const actualMaxWidth = this.X(maxWidth)
    const actualLineHeight = this.Y(lineHeight)
    const actualFontSize = this.S(fontSize)
    const lines = this.wrapText(text, actualMaxWidth, actualFontSize).slice(0, maxLines || 99)
    ctx.font = `${actualFontSize}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'

    lines.forEach((line, index) => ctx.fillText(line, actualX, actualY + index * actualLineHeight))
    ctx.restore()
  },

  drawCenteredFittedText(text, y, maxWidth, maxFontSize, minFontSize = 22) {
    const ctx = this.ctx
    const value = String(text || '')
    const actualMaxWidth = this.X(maxWidth)
    let actualFontSize = this.S(maxFontSize)
    const actualMinFontSize = this.S(minFontSize)
    ctx.save()
    while (actualFontSize > actualMinFontSize) {
      ctx.font = `${actualFontSize}px sans-serif`
      if (ctx.measureText(value).width <= actualMaxWidth) break
      actualFontSize -= 1
    }
    ctx.font = `${Math.max(actualFontSize, actualMinFontSize)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.fillText(value, this.X(DESIGN_CX), this.Y(y), actualMaxWidth)
    ctx.restore()
  },

  drawAdaptiveText(text, x, y, maxWidth, maxFontSize, minFontSize, maxLines, lineHeight, align = 'center') {
    const ctx = this.ctx
    const value = String(text || '')
    const width = this.X(maxWidth)
    let size = maxFontSize
    let lines = []
    while (size >= minFontSize) {
      lines = this.wrapText(value, width, this.S(size))
      if (lines.length <= maxLines) break
      size -= 1
    }
    ctx.save()
    ctx.font = `${this.S(Math.max(size, minFontSize))}px sans-serif`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    lines.slice(0, maxLines).forEach((line, index) => {
      ctx.fillText(line, this.X(x), this.Y(y + index * lineHeight), width)
    })
    ctx.restore()
    return Math.min(lines.length, maxLines)
  },

  roundRect(x, y, width, height, radius, fill, stroke) {
    const ctx = this.ctx
    x = this.X(x); y = this.Y(y); width = this.X(width); height = this.Y(height); radius = this.S(radius)
    ctx.save()
    radius = Math.min(radius, width / 2, height / 2)
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.stroke() }
    ctx.restore()
  },

  drawTopIdentity(result, bestMatch) {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = '#fbe7ff'
    this.drawLines('✦  YOUR ANIME SOUL  ✦', DESIGN_CX, 148, 580, 25, 23, 1)
    ctx.strokeStyle = 'rgba(255,211,244,0.72)'
    ctx.lineWidth = this.S(1.5)
    ctx.beginPath(); ctx.moveTo(this.X(160), this.Y(179)); ctx.lineTo(this.X(347), this.Y(179))
    ctx.moveTo(this.X(403), this.Y(179)); ctx.lineTo(this.X(590), this.Y(179)); ctx.stroke()
    ctx.fillStyle = '#ffe7fa'
    this.drawLines('✧', DESIGN_CX, 179, 48, 20, 22, 1)
    ctx.shadowColor = 'rgba(229, 158, 255, 0.92)'
    ctx.shadowBlur = this.S(30)
    ctx.fillStyle = '#fffaff'
    this.drawCenteredFittedText(result.mbti || bestMatch.mbti || 'MBTI', 250, 600, 102, 68)
    ctx.restore()
    ctx.fillStyle = '#fbe4ff'
    this.drawCenteredFittedText(bestMatch.title || '原创人格', 314, 530, 36, 26)
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 218, 248, 0.54)'
    ctx.lineWidth = this.S(1)
    ctx.beginPath(); ctx.moveTo(this.X(283), this.Y(340)); ctx.lineTo(this.X(467), this.Y(340)); ctx.stroke()
    ctx.restore()
  },

  drawIdentity(bestMatch) {
    const ctx = this.ctx

    const titleShade = ctx.createLinearGradient(0, this.Y(765), 0, this.Y(1300))
    titleShade.addColorStop(0, 'rgba(18, 12, 56, 0)')
    titleShade.addColorStop(0.3, 'rgba(18, 12, 56, 0.72)')
    titleShade.addColorStop(0.65, 'rgba(18, 12, 56, 0.78)')
    titleShade.addColorStop(1, 'rgba(18, 12, 56, 0)')
    ctx.save()
    ctx.fillStyle = titleShade
    ctx.fillRect(0, this.Y(765), this.cssWidth, this.Y(535))
    ctx.restore()
    ctx.fillStyle = '#f8d9f7'
    this.drawLines('✦  你 最 像  ✦', DESIGN_CX, 820, 560, 25, 24, 1)
    ctx.save()
    ctx.shadowColor = 'rgba(232, 160, 255, 0.86)'
    ctx.shadowBlur = this.S(24)
    this.ctx.fillStyle = '#ffffff'
    this.drawAdaptiveText(bestMatch.name || '未知角色', DESIGN_CX, 884, 630, 65, 34, 1, 65)
    ctx.restore()
    ctx.fillStyle = '#f3e5ff'
    this.drawAdaptiveText(`《${bestMatch.anime || '星屿纪行'}》`, DESIGN_CX, 946, 610, 30, 19, 2, 34)
    ctx.fillStyle = '#e8cee9'
    this.drawLines('人 格 相 似 度', DESIGN_CX, 1017, 500, 24, 20, 1)
    const accent = ctx.createLinearGradient(this.X(265), 0, this.X(485), 0)
    accent.addColorStop(0, '#ffe6ae')
    accent.addColorStop(0.5, '#f5b6ef')
    accent.addColorStop(1, '#bfb3ff')
    ctx.fillStyle = accent
    this.drawCenteredFittedText(`${clamp(bestMatch.similarity)}%`, 1067, 350, 55, 41)
  },

  drawTags(bestMatch) {
    const tags = Array.isArray(bestMatch.tags) ? bestMatch.tags.slice(0, 4).join('   ✦   ') : ''

    this.ctx.fillStyle = '#edc7ef'
    this.drawAdaptiveText(tags, DESIGN_CX, 1120, 610, 21, 15, 1, 22)
  },

  drawResultLine(bestMatch) {
    const text = `“${bestMatch.resultLine || '寻找你的原创二次元角色'}”`

    this.ctx.save()
    this.ctx.strokeStyle = 'rgba(251, 217, 255, 0.65)'
    this.ctx.lineWidth = this.S(1.5)
    this.ctx.beginPath()
    this.ctx.moveTo(this.X(210), this.Y(1160))
    this.ctx.lineTo(this.X(540), this.Y(1160))
    this.ctx.stroke()
    this.ctx.restore()
    this.ctx.fillStyle = '#fff7ff'
    this.drawAdaptiveText(text, DESIGN_CX, 1194, 590, 27, 19, 3, 34)
  },

  drawTraits(rawTraits) {
    const traits = TRAIT_KEYS.map((key) => ({ key, value: clamp(rawTraits[key]) }))
      .sort((a, b) => b.value - a.value).slice(0, 4)

    this.ctx.fillStyle = '#eac5f6'
    this.drawLines('—  人 格 印 记  —', DESIGN_CX, 1300, 550, 28, 23, 1)
    traits.forEach((item, index) => {
      const left = index % 2 === 0
      const centerX = left ? 225 : 525
      const y = index < 2 ? 1343 : 1399
      const ctx = this.ctx
      ctx.save()
      ctx.fillStyle = '#f8d3f8'
      this.drawAdaptiveText(`✦  ${TRAIT_KEYWORDS[item.key]}`, centerX, y, 240, 29, 22, 1, 29)
      ctx.strokeStyle = 'rgba(239, 188, 248, 0.55)'
      ctx.lineWidth = this.S(1)
      ctx.beginPath()
      ctx.moveTo(this.X(centerX - 105), this.Y(y + 25))
      ctx.lineTo(this.X(centerX + 105), this.Y(y + 25))
      ctx.stroke()
      ctx.restore()
    })
  },

  drawBrandFooter() {
    this.ctx.fillStyle = 'rgba(255, 231, 251, 0.72)'
    this.drawLines('MBTI  ×  ORIGINAL CHARACTER', DESIGN_CX, 1547, 550, 22, 18, 1)
  },

  drawDebugLayout() {
    const ctx = this.ctx
    const centerX = this.cssWidth / 2
    ctx.save()
    ctx.lineWidth = this.S(2)
    ctx.strokeStyle = 'rgba(255, 70, 70, 0.9)'
    ctx.strokeRect(this.X(95), this.Y(186), this.X(560), this.Y(355))
    ctx.strokeStyle = 'rgba(70, 255, 170, 0.9)'
    ctx.strokeRect(this.X(DESIGN_SAFE_LEFT), this.Y(515), this.X(DESIGN_SAFE_WIDTH), this.Y(215))
    ctx.strokeRect(this.X(DESIGN_SAFE_LEFT), this.Y(738), this.X(DESIGN_SAFE_WIDTH), this.Y(72))
    ctx.strokeRect(this.X(DESIGN_SAFE_LEFT), this.Y(820), this.X(DESIGN_SAFE_WIDTH), this.Y(135))
    ctx.strokeStyle = 'rgba(255, 230, 80, 0.9)'
    ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, this.cssHeight); ctx.stroke()
    ctx.strokeStyle = 'rgba(80, 190, 255, 0.9)'
    ctx.beginPath(); ctx.moveTo(this.X(DESIGN_SAFE_LEFT), 0); ctx.lineTo(this.X(DESIGN_SAFE_LEFT), this.cssHeight)
    ctx.moveTo(this.X(DESIGN_SAFE_RIGHT), 0); ctx.lineTo(this.X(DESIGN_SAFE_RIGHT), this.cssHeight); ctx.stroke()
    ctx.restore()

  },

  X(value) { return Number(value) * this.designScale },
  Y(value) { return Number(value) * this.designScale },
  S(value) { return Number(value) * this.designScale },

  retry() {
    if (this.disposed || this.generationRunning || this.needsGeneration) return
    posterPreviewCache = null
    if (this.result) invalidateCloudImage(this.result.bestMatch.image || FALLBACK_CHARACTER)
    invalidateCloudImage(BACKGROUND)
    this.needsGeneration = true
    this.setData({ errorMessage: '', isDrawing: true, isReady: false }, () => this.startPendingGeneration())
  },
  onPosterImageLoad() {
    if (this.disposed || !this.data.isReady || this.data.isDrawing) return
    if (!this.data.previewVisible) this.setData({ previewVisible: true })
  },
  onPosterImageError(error) {
    if (this.disposed || !this.data.previewPath) return
    console.error('[poster] preview image failed')
    const wasCached = this.reusedPreviewCache
    if (posterPreviewCache && posterPreviewCache.path === this.data.previewPath) posterPreviewCache = null
    if (this.data.isDrawing) return
    if (wasCached) {
      this.needsGeneration = true
      this.setData({ previewPath: '', previewVisible: false, posterPath: '', isReady: false, isDrawing: true }, () => this.startPendingGeneration())
      return
    }
    this.setData({ previewVisible: false, isReady: false, errorMessage: '海报预览加载失败，请重新生成。' })
  },
  savePoster() {
    if (!this.data.posterPath) return
    wx.saveImageToPhotosAlbum({ filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (error) => {
        console.error('[poster] save failed')
        if (/auth deny|auth denied|authorize/.test((error && error.errMsg) || '')) wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片到相册。', confirmText: '去设置', success: (modal) => { if (modal.confirm) wx.openSetting({}) } })
        else wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  },
  backResult() {
    if (this.returnToResult) { wx.redirectTo({ url: '/pages/result/result' }); return }
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/result/result' }) })
  },
  cloudImageError(event) { cloudPageImageError(this, event) },
  backHome() { wx.reLaunch({ url: '/pages/index/index' }) },
  onShareAppMessage() { return { title: '寻找你的原创二次元角色', path: '/pages/index/index' } }
})
