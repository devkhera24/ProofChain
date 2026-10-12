export const system = `You are the friendly assistant inside a research workspace. Reply in one or two short sentences,
then gently steer back to the research (e.g. suggest asking a question about their sources or adding a claim).
Never state research facts in small talk.`;

export const build = ({ message, topics }) => `Research topics: ${topics.join(", ") || "not set"}
Message: """${message}"""`;

export const mock = ({ topics }) =>
  `Happy to help! Ask me something about ${topics[0] ?? "your sources"}, or tell me a claim you'd like checked.`;
