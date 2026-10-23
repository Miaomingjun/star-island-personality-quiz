const questions = [
  {
    id: 1,
    dimension: 'EI',
    question: '周末朋友突然邀请你参加一个完全陌生人的聚会，你更可能？',
    options: [
      { key: 'A', text: '有点期待，也许能认识有趣的人', scores: { E: 2, social: 3, adventure: 1 } },
      { key: 'B', text: '第一反应是想找理由拒绝', scores: { I: 2, independence: 2, idealism: 1 } }
    ]
  },
  {
    id: 2,
    dimension: 'SN',
    question: '学习一个新技能时，你通常会先？',
    options: [
      { key: 'A', text: '照着清晰步骤练习，先把基础打牢', scores: { S: 2, action: 2, logic: 1 } },
      { key: 'B', text: '先想象它还能被怎样创意地使用', scores: { N: 2, creativity: 3, idealism: 1 } }
    ]
  },
  {
    id: 3,
    dimension: 'TF',
    question: '朋友来向你倾诉烦恼时，你更倾向于？',
    options: [
      { key: 'A', text: '陪他梳理问题，给出最有效的解决方案', scores: { T: 2, logic: 2, independence: 1 } },
      { key: 'B', text: '先抱抱他，让他感受到被理解和支持', scores: { F: 2, empathy: 3, social: 1 } }
    ]
  },
  {
    id: 4,
    dimension: 'JP',
    question: '出门旅行前，你会怎样安排？',
    options: [
      { key: 'A', text: '提前做好行程表，重要事项都确认好', scores: { J: 2, action: 2, logic: 1 } },
      { key: 'B', text: '只决定大方向，沿途看心情探索', scores: { P: 2, adventure: 3, creativity: 1 } }
    ]
  },
  {
    id: 5,
    dimension: 'EI',
    question: '在一群刚认识的人里，你更可能？',
    options: [
      { key: 'A', text: '主动开启话题，让气氛热闹起来', scores: { E: 2, social: 3, action: 1 } },
      { key: 'B', text: '先安静观察，和少数人慢慢熟悉', scores: { I: 2, independence: 2, empathy: 1 } }
    ]
  },
  {
    id: 6,
    dimension: 'SN',
    question: '回忆一次难忘的经历时，你最先想起的是？',
    options: [
      { key: 'A', text: '当时发生的细节、声音和具体画面', scores: { S: 2, empathy: 1, action: 1 } },
      { key: 'B', text: '那段经历带给你的意义和未来可能性', scores: { N: 2, idealism: 2, creativity: 1 } }
    ]
  },
  {
    id: 7,
    dimension: 'TF',
    question: '团队出现分歧时，你更看重？',
    options: [
      { key: 'A', text: '用客观标准比较方案，选择最合理的', scores: { T: 2, logic: 3, independence: 1 } },
      { key: 'B', text: '照顾每个人的感受，让大家都能接受', scores: { F: 2, empathy: 3, social: 1 } }
    ]
  },
  {
    id: 8,
    dimension: 'JP',
    question: '面对一个截止日期很远的任务，你会？',
    options: [
      { key: 'A', text: '拆成计划逐步完成，提前留出余量', scores: { J: 2, action: 2, logic: 1 } },
      { key: 'B', text: '灵感来了再集中处理，保持弹性', scores: { P: 2, creativity: 2, adventure: 1 } }
    ]
  },
  {
    id: 9,
    dimension: 'EI',
    question: '忙碌的一天结束后，什么最能让你恢复能量？',
    options: [
      { key: 'A', text: '和喜欢的人聊天，分享今天的新鲜事', scores: { E: 2, social: 2, empathy: 1 } },
      { key: 'B', text: '独处看书、听歌或沉浸在自己的世界里', scores: { I: 2, independence: 3, idealism: 1 } }
    ]
  },
  {
    id: 10,
    dimension: 'SN',
    question: '看到一幅充满想象力的画，你会先想到？',
    options: [
      { key: 'A', text: '画面里使用了哪些真实的技法和材质', scores: { S: 2, logic: 1, action: 1 } },
      { key: 'B', text: '如果进入画中，那里会发生怎样的故事', scores: { N: 2, creativity: 3, idealism: 1 } }
    ]
  },
  {
    id: 11,
    dimension: 'TF',
    question: '做出重要选择时，你通常更依赖？',
    options: [
      { key: 'A', text: '事实、数据和长期收益的分析', scores: { T: 2, logic: 3, independence: 1 } },
      { key: 'B', text: '内心价值和这个选择对他人的影响', scores: { F: 2, empathy: 2, idealism: 2 } }
    ]
  },
  {
    id: 12,
    dimension: 'JP',
    question: '理想中的周末，你更喜欢？',
    options: [
      { key: 'A', text: '安排好想做的事，按节奏完成并获得满足感', scores: { J: 2, action: 2, logic: 1 } },
      { key: 'B', text: '保持开放，临时发现一场有趣的小冒险', scores: { P: 2, adventure: 3, creativity: 1 } }
    ]
  }
]

module.exports = questions
