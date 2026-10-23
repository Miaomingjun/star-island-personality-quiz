const { initCloudImages, disposeCloudImages, cloudPageImageError } = require('../../utils/cloud-image')
Page({
  data: {
    backgroundSrc: '/assets/placeholders/background.png',
    heroSrc: '/assets/placeholders/character.png',
    stars: [
      { left: 9, top: 16, opacity: 0.75 }, { left: 18, top: 34, opacity: 0.4 },
      { left: 81, top: 12, opacity: 0.7 }, { left: 90, top: 28, opacity: 0.45 },
      { left: 73, top: 42, opacity: 0.65 }, { left: 11, top: 63, opacity: 0.55 },
      { left: 87, top: 67, opacity: 0.8 }, { left: 28, top: 74, opacity: 0.35 },
      { left: 61, top: 22, opacity: 0.45 }, { left: 48, top: 8, opacity: 0.65 }
    ],
    petals: [
      { left: 8, top: 24, rotate: 30 }, { left: 88, top: 22, rotate: -35 },
      { left: 15, top: 55, rotate: 55 }, { left: 79, top: 58, rotate: -20 },
      { left: 26, top: 12, rotate: 15 }, { left: 68, top: 72, rotate: 78 }
    ]
  },

  onLoad() { initCloudImages(this, { backgroundSrc: '/assets/backgrounds/home-bg.png', heroSrc: '/assets/home/home-character.png' }) },
  onUnload() { disposeCloudImages(this) },
  cloudImageError(event) { cloudPageImageError(this, event) },
  startTest() {
    wx.removeStorageSync('mbtiQuizState')
    wx.navigateTo({ url: '/pages/quiz/quiz' })
  }
})
