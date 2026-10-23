const questions = require('../../data/questions')
const { initCloudImages, disposeCloudImages, cloudPageImageError } = require('../../utils/cloud-image')
const characters = require('../../data/characters')
const { createEmptyScores, addScores, buildResult } = require('../../utils/mbti')
const { matchCharacters } = require('../../utils/matcher')

const STORAGE_KEY = 'mbtiQuizState'

Page({
  data: {
    backgroundSrc: '/assets/placeholders/background.png',
    questions,
    currentIndex: 0,
    currentQuestion: questions[0],
    total: questions.length,
    displayNumber: 1,
    progressPercent: 100 / questions.length,
    answers: [],
    scores: createEmptyScores(),
    selectedKey: '',
    isTransitioning: false
  },

  onLoad() {
    initCloudImages(this, { backgroundSrc: '/assets/backgrounds/quiz-bg.png' })
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (saved && typeof saved.currentIndex === 'number' && saved.currentIndex < questions.length) {
      this.setData({
        currentIndex: saved.currentIndex,
        currentQuestion: questions[saved.currentIndex],
        displayNumber: saved.currentIndex + 1,
        progressPercent: ((saved.currentIndex + 1) / questions.length) * 100,
        answers: saved.answers || [],
        scores: saved.scores || createEmptyScores()
      })
    } else {
      this.persistState(0, [], createEmptyScores())
    }
  },

  onUnload() {
    disposeCloudImages(this)
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer)
      this.transitionTimer = null
    }
  },

  cloudImageError(event) { cloudPageImageError(this, event) },
  persistState(currentIndex, answers, scores) {
    wx.setStorageSync(STORAGE_KEY, { currentIndex, answers, scores })
  },

  saveResult(result) {
    const app = typeof getApp === 'function' ? getApp() : null
    if (app) {
      app.globalData = app.globalData || {}
      app.globalData.currentResult = result
    }
    wx.setStorageSync('mbtiResult', result)

  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  selectOption(event) {
    if (this.data.isTransitioning) return
    const key = event.currentTarget.dataset.key
    const option = this.data.currentQuestion.options.find((item) => item.key === key)
    if (!option) return

    const answers = this.data.answers.slice()
    answers[this.data.currentIndex] = key
    const scores = addScores(this.data.scores, option.scores)
    this.setData({ selectedKey: key, isTransitioning: true, answers, scores })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.persistState(this.data.currentIndex, answers, scores)

    this.transitionTimer = setTimeout(() => {
      const nextIndex = this.data.currentIndex + 1
      if (nextIndex >= questions.length) {
        this.persistState(questions.length, answers, scores)
        const result = buildResult(scores, questions)
        const matches = matchCharacters(result, characters)
        const finalResult = Object.assign({}, result, matches)
        this.saveResult(finalResult)

        this.transitionTimer = null
        wx.navigateTo({ url: '/pages/result/result' })
        return
      }
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        displayNumber: nextIndex + 1,
        progressPercent: ((nextIndex + 1) / questions.length) * 100,
        selectedKey: '',
        isTransitioning: false
      })
      this.persistState(nextIndex, answers, scores)
      this.transitionTimer = null
    }, 250)
  }
})
