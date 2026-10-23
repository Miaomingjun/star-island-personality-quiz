// The original mini-program used a cloud image resolver. This public demo
// keeps its page-facing API while resolving bundled artwork locally only.
const CHARACTER_PLACEHOLDER = '/assets/placeholders/character.png'
const BACKGROUND_PLACEHOLDER = '/assets/placeholders/background.png'
const CLOUD_IMAGE_CACHE_MAX_AGE_MS = 5 * 60 * 1000
const revisions = new Map()

function getCloudImageVersion(src) {
  return String(revisions.get(src) || 0)
}

function getLocalFallback(src) {
  if (typeof src === 'string' && src.indexOf('/assets/backgrounds/') === 0) return BACKGROUND_PLACEHOLDER
  if (typeof src === 'string' && (src.indexOf('/assets/characters/') === 0 || src === '/assets/home/home-character.png')) return CHARACTER_PLACEHOLDER
  return src || CHARACTER_PLACEHOLDER
}

function invalidateCloudImage(src) {
  revisions.set(src, (revisions.get(src) || 0) + 1)
}

function resolveCloudImage(src) {
  return Promise.resolve({ path: src || getLocalFallback(src), source: 'local', version: getCloudImageVersion(src) })
}

function initCloudImages(page, bindings) {
  page.cloudPageImageDisposed = false
  page.cloudImageBindings = bindings
  page.cloudImageSources = {}
  const initial = {}
  Object.keys(bindings).forEach(key => {
    initial[key] = bindings[key]
    page.cloudImageSources[key] = 'local'
  })
  page.setData(initial)
}

function disposeCloudImages(page) {
  page.cloudPageImageDisposed = true
}

function cloudPageImageError(page, event) {
  const key = event.currentTarget.dataset.cloudField
  const src = page.cloudImageBindings && page.cloudImageBindings[key]
  if (!src || page.cloudPageImageDisposed) return
  invalidateCloudImage(src)
  page.cloudImageSources[key] = 'local-fallback'
  const fallback = getLocalFallback(src)
  if (page.data[key] !== fallback) page.setData({ [key]: fallback })
}

module.exports = { resolveCloudImage, invalidateCloudImage, getLocalFallback,
  initCloudImages, disposeCloudImages, cloudPageImageError, getCloudImageVersion,
  CLOUD_IMAGE_CACHE_MAX_AGE_MS }
