/** @param {string[]} topicIds */
export const buildTopicKey = (topicIds = []) => {
  const sorted = [...topicIds].filter(Boolean).sort();
  return sorted.length ? sorted.join(',') : 'default';
};
